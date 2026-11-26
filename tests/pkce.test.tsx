import type { PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { generateCodeChallenge } from '@nhost/nhost-js/auth'
import { afterEach, expect, it, vi } from 'vitest'
import { NhostProvider, preparePKCE, useNhost } from '../src'
import { deferred, fixture, response, session } from './fixtures'

function verificationClient() {
  const { client } = fixture()
  const wrapper = ({ children }: PropsWithChildren) =>
    <NhostProvider nhostClient={client} pkceCallbackPath="/verify">{children}</NhostProvider>
  return { client, wrapper }
}

afterEach(() => {
  history.replaceState(null, '', '/')
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('exchanges the email code once in Strict Mode using the verifier behind the original challenge', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ session: session() }))
  vi.stubGlobal('fetch', fetch)
  const { client, wrapper } = verificationClient()
  const { codeChallenge } = await preparePKCE(client)
  history.replaceState({ page: 1 }, '', '/verify?next=home&code=sample#done')
  const { result } = renderHook(useNhost, { wrapper, reactStrictMode: true })
  await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
  expect(result.current).toMatchObject({ userId: 'user-a', isLoading: false, callbackError: null })
  expect(fetch).toHaveBeenCalledTimes(1)
  const [url, init] = fetch.mock.calls[0]!
  expect(new URL(url).pathname).toBe('/v1/token/exchange')
  const body = JSON.parse(init.body)
  expect(body.code).toBe('sample')
  expect(await generateCodeChallenge(body.codeVerifier)).toBe(codeChallenge)
  expect(localStorage.length).toBe(0)
  expect(location.pathname + location.search + location.hash).toBe('/verify?next=home#done')
  expect(history.state).toEqual({ page: 1 })
})

it.each([
  ['/verify?code=abc', 'No verification request'],
  ['/verify', 'missing its authorization code'],
])('reports an incomplete callback at %s', async (path, message) => {
  const { client, wrapper } = verificationClient()
  const exchange = vi.spyOn(client.auth, 'tokenExchange')
  history.replaceState(null, '', path)
  const { result } = renderHook(useNhost, { wrapper })
  await waitFor(() => expect(result.current.callbackError?.message).toContain(message))
  expect(result.current.isLoading).toBe(false)
  expect(exchange).not.toHaveBeenCalled()
})

it('leaves other applications’ codes untouched outside the configured callback', () => {
  history.replaceState(null, '', '/other?code=foreign')
  const { client, wrapper } = verificationClient()
  const exchange = vi.spyOn(client.auth, 'tokenExchange')
  const { result } = renderHook(useNhost, { wrapper })
  expect(location.search).toBe('?code=foreign')
  expect(result.current.callbackError).toBeNull()
  expect(exchange).not.toHaveBeenCalled()
})

it.each(['rejected', 'empty session'])('surfaces a %s exchange and consumes the verifier', async kind => {
  const { client, wrapper } = verificationClient()
  const attempt = await preparePKCE(client)
  const exchange = vi.spyOn(client.auth, 'tokenExchange')
  if (kind === 'rejected') exchange.mockRejectedValue('expired code')
  else exchange.mockResolvedValue(response({}))
  history.replaceState(null, '', '/verify?code=expired')
  const { result } = renderHook(useNhost, { wrapper })
  await waitFor(() => expect(result.current.callbackError?.message).toBe(kind === 'rejected' ? 'expired code' : 'Verification did not return a session.'))
  expect(result.current.isAuthenticated).toBe(false)
  expect(localStorage.length).toBe(0)
  attempt.clear()
  expect(localStorage.length).toBe(0)
})

it('preserves a newer attempt when an earlier request finishes', async () => {
  const { client, wrapper } = verificationClient()
  const earlier = await preparePKCE(client)
  const gate = deferred<ReturnType<typeof response<{ session: ReturnType<typeof session> }>>>()
  vi.spyOn(client.auth, 'tokenExchange').mockReturnValue(gate.promise)
  history.replaceState(null, '', '/verify?code=first')
  const { result } = renderHook(useNhost, { wrapper })
  const newer = await preparePKCE(client)
  earlier.clear()
  await act(async () => { gate.resolve(response({ session: session() })); await gate.promise })
  expect(result.current.callbackError).toBeNull()
  expect(localStorage.length).toBe(1)
  newer.clear()
})
