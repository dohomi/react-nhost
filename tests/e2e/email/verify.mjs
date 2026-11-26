import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const playground = 'http://localhost:5197'
const auth = 'http://localhost:19902/v1'
const mail = 'http://127.0.0.1:19903/api/v2/messages'

async function waitForAuth() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch(auth + '/healthz', { signal: AbortSignal.timeout(1000) }).catch(() => null)
    if (response?.ok) return
    await delay(500)
  }
  throw new Error('Disposable Auth did not become healthy within the startup timeout.')
}

async function verificationLink(email) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(mail, { signal: AbortSignal.timeout(3000) })
    assert.ok(response.ok, 'MailHog API request failed')
    const { items } = await response.json()
    const message = items.find(({ To }) => To.some(({ Mailbox, Domain }) => Mailbox + '@' + Domain === email))
    if (message) {
      // MailHog returns the raw MIME body. Unwrap quoted-printable lines before reading the URL.
      const html = message.Content.Body.replace(/=\r?\n/g, '')
        .replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replaceAll('&amp;', '&')
      const link = html.match(/https?:\/\/[^\s"'<>]+/g)?.find(value => {
        const url = new URL(value)
        return url.origin + url.pathname === auth + '/verify'
      })
      assert.ok(link, 'Expected a verification link pointing to the disposable Auth service')
      return link
    }
    await delay(500)
  }
  throw new Error('No verification email arrived in the disposable mailbox.')
}

async function verifyEmail(browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const email = 'playground-' + randomBytes(8).toString('hex') + '@example.test'
  await page.goto(playground)
  await page.getByRole('button', { name: 'Register with email' }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(randomBytes(16).toString('hex') + 'Aa9!')
  const [signup] = await Promise.all([
    page.waitForRequest(request => request.url() === auth + '/signup/email-password' && request.method() === 'POST'),
    page.getByRole('button', { name: 'Create account' }).click(),
  ])
  const signupResponse = await signup.response()
  if (!signupResponse?.ok()) {
    const error = await signupResponse?.json()
    throw new Error(`Registration failed (HTTP ${signupResponse?.status()}): ${(typeof error === 'string' ? error : error?.message ?? error?.error ?? Object.keys(error ?? {}).join(', '))}`)
  }
  const challenge = signup.postDataJSON().codeChallenge
  assert.ok(challenge, 'Registration must include a PKCE challenge')
  await page.getByText('Check ' + email, { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Sign out' }).count(), 0)
  const link = await verificationLink(email)
  console.log('Registration is pending and the verification email arrived.')

  const callback = await context.newPage()
  const exchanges = []
  let redirectedWithCode = false
  callback.on('request', request => {
    const url = new URL(request.url())
    if (url.origin + url.pathname === playground + '/verify' && request.isNavigationRequest()) {
      if (url.searchParams.has('code') && !url.searchParams.has('refreshToken')) redirectedWithCode = true
    }
    if (request.url() === auth + '/token/exchange' && request.method() === 'POST') exchanges.push(request.postDataJSON())
  })
  await callback.goto(link)
  const account = callback.getByText('Signed in as ' + email + '.', { exact: true })
  await account.waitFor()
  assert.ok(redirectedWithCode, 'Expected a PKCE code in the verification redirect')
  assert.equal(exchanges.length, 1)
  assert.ok(exchanges[0].code)
  assert.equal(createHash('sha256').update(exchanges[0].codeVerifier).digest('base64url'), challenge)
  const cleaned = new URL(callback.url())
  assert.equal(cleaned.pathname, '/verify')
  assert.equal(cleaned.searchParams.get('type'), 'verifyEmail')
  assert.ok(!cleaned.searchParams.has('code') && !cleaned.searchParams.has('refreshToken'))
  await callback.reload()
  await account.waitFor()
  await callback.getByRole('button', { name: 'Sign out' }).click()
  const login = callback.getByRole('button', { name: 'Sign in', exact: true })
  await login.waitFor()
  await callback.reload()
  await login.waitFor()
  assert.equal(exchanges.length, 1)
  console.log('PASS: PKCE verification, URL cleanup, session persistence, and sign-out.')
}

await waitForAuth()
const server = await createServer({
  configFile: 'playground/vite.config.ts',
  server: { host: 'localhost', port: 5197, strictPort: true },
})
try {
  await server.listen()
  const browser = await chromium.launch(process.env.CHROME_BIN
    ? { executablePath: process.env.CHROME_BIN }
    : { channel: 'chrome' })
  try {
    await verifyEmail(browser)
  } finally {
    await browser.close()
  }
} finally {
  await server.close()
}
