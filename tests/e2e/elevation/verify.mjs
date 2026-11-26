import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const auth = 'http://localhost:19902/v1'
for (let i = 0; i < 120; i++) {
  if ((await fetch(auth + '/healthz').catch(() => null))?.ok) break
  if (i === 119) throw new Error('Nhost Auth did not start')
  await delay(500)
}

// Auth tracks this table. Grant the application role access to its own keys.
const permission = await fetch('http://localhost:19904/v1/metadata', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': process.env.GQL_ADMIN },
  body: JSON.stringify({ type: 'pg_create_select_permission', args: {
    source: 'default', table: { schema: 'auth', name: 'user_security_keys' }, role: 'user',
    permission: { columns: ['id', 'nickname', 'user_id'], filter: { user_id: { _eq: 'X-Hasura-User-Id' } } },
  } }),
})
assert.ok(permission.ok, await permission.text())

const server = await createServer({ configFile: false, root: '.', server: { host: 'localhost', port: 5197, strictPort: true } })
try {
  await server.listen()
  const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' })
  try {
    const page = await browser.newPage()
    page.on('pageerror', err => console.error(err.message))
    page.on('response', async res => {
      if (res.status() >= 400) console.error(new URL(res.url()).pathname, res.status(), (await res.json()).message)
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    } })
    await page.goto('http://localhost:5197/tests/e2e/elevation/')
    await page.waitForFunction(() => typeof window.enroll === 'function')
    const email = randomUUID() + '@example.test'
    const userId = await page.evaluate(args => window.enroll(args), { email, password: randomUUID() })
    const credentials = async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials
    const [registered] = await credentials()
    assert.equal(registered.rpId, 'localhost')

    // Reload so the hook discovers the newly enrolled key using the persisted normal session.
    await page.reload()
    const newPassword = randomUUID()
    await page.getByLabel('New password').fill(newPassword)
    const paths = ['/elevate/webauthn', '/elevate/webauthn/verify', '/user/password']
    const observed = []
    page.on('request', req => {
      if (req.method() === 'POST' && paths.some(path => req.url() === auth + path)) observed.push(req)
    })
    await page.getByRole('button', { name: 'Change password' }).click()
    await page.waitForFunction(() => document.querySelector('output')?.textContent)
    assert.equal(await page.locator('output').textContent(), 'Password changed')
    assert.deepEqual(observed.map(req => req.url()), paths.map(path => auth + path))
    const claim = req => {
      const token = req.headers().authorization.split(' ')[1]
      return JSON.parse(Buffer.from(token.split('.')[1], 'base64url'))['https://hasura.io/jwt/claims']['x-hasura-auth-elevated']
    }
    assert.notEqual(claim(observed[0]), userId)
    assert.equal(claim(observed[2]), userId)
    const [used] = await credentials()
    assert.equal(used.credentialId, registered.credentialId)
    assert.ok(used.signCount > registered.signCount)
    const login = await page.request.post(auth + '/signin/email-password', { data: { email, password: newPassword } })
    assert.equal((await login.json()).session.user.id, userId)
    console.log('PASS: registered credential, verified assertion, elevated session, and password change.')
  } finally {
    await browser.close()
  }
} finally {
  await server.close()
}
