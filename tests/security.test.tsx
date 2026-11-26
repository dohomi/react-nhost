import { act, renderHook, waitFor } from '@testing-library/react'
import { startAuthentication } from '@simplewebauthn/browser'
import { expect, it, vi } from 'vitest'
import { useNhostAuthElevated, useNhostSecurity } from '../src'
import { deferred, fixture, response, session } from './fixtures'

vi.mock('@simplewebauthn/browser', () => ({ startAuthentication: vi.fn() }))

const key = { id: 'first', nickname: 'Laptop' }
const keysResponse = (keys: typeof key[]) => response({ data: { authUserSecurityKeys: keys } })

it('waits for discovery and verification before calling the elevated method', async () => {
  const { client, wrapper } = fixture()
  client.sessionStorage.set(session())
  const lookup = deferred<ReturnType<typeof keysResponse>>()
  const query = vi.spyOn(client.graphql, 'request').mockReturnValue(lookup.promise)
  const challenge = { challenge: 'challenge' }
  vi.spyOn(client.auth, 'elevateWebauthn').mockResolvedValue(response(challenge))
  const credential = { id: 'key' } as Awaited<ReturnType<typeof startAuthentication>>
  vi.mocked(startAuthentication).mockResolvedValue(credential)
  const verify = vi.spyOn(client.auth, 'verifyElevateWebauthn').mockResolvedValue(response({ session: session('user-a', true) }))
  const data = response('OK' as const)
  const change = vi.spyOn(client.auth, 'changeUserPassword').mockResolvedValue(data)
  const { result } = renderHook(() => useNhostAuthElevated({ fn: 'changeUserPassword' }), { wrapper })
  let pending!: ReturnType<typeof result.current.callAsync>
  act(() => { pending = result.current.callAsync({ newPassword: 'another-password' }) })
  expect(result.current.isLoading).toBe(true)
  expect(change).not.toHaveBeenCalled()
  await act(async () => { lookup.resolve(keysResponse([key])); expect(await pending).toBe(data) })
  expect(query).toHaveBeenCalledTimes(1)
  expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: challenge })
  expect(verify).toHaveBeenCalledWith({ email: 'user-a@example.com', credential })
  expect(change).toHaveBeenCalledOnce()
  expect(client.getUserSession()?.decodedToken['https://hasura.io/jwt/claims']).toMatchObject({ 'x-hasura-auth-elevated': 'user-a' })
  await act(async () => { await result.current.callAsync({ newPassword: 'third-password' }) })
  expect(verify).toHaveBeenCalledTimes(1)
})

it('exposes a cancelled prompt through the operation result, state, and onError', async () => {
  const { client, wrapper } = fixture()
  client.sessionStorage.set(session())
  vi.spyOn(client.graphql, 'request').mockResolvedValue(keysResponse([key]))
  vi.spyOn(client.auth, 'elevateWebauthn').mockResolvedValue(response({ challenge: 'test' }))
  const error = new Error('User cancelled')
  vi.mocked(startAuthentication).mockRejectedValueOnce(error)
  const change = vi.spyOn(client.auth, 'changeUserPassword')
  const onError = vi.fn()
  const { result } = renderHook(() => useNhostAuthElevated({ fn: 'changeUserPassword', onError }), { wrapper })
  const params = { newPassword: 'new-password' }
  await act(async () => { expect(await result.current.callAsync(params)).toBe(error) })
  expect(result.current).toMatchObject({ isLoading: false, isSuccess: false, error })
  expect(onError).toHaveBeenCalledWith({ nhost: client, params, error })
  expect(change).not.toHaveBeenCalled()
})

it('retries a failed key lookup and proceeds when the user has no keys', async () => {
  const { client, wrapper } = fixture()
  client.sessionStorage.set(session())
  const lookup = deferred<ReturnType<typeof keysResponse>>()
  const query = vi.spyOn(client.graphql, 'request').mockReturnValueOnce(lookup.promise).mockResolvedValue(keysResponse([]))
  const change = vi.spyOn(client.auth, 'changeUserPassword').mockResolvedValue(response('OK' as const))
  const { result } = renderHook(() => useNhostAuthElevated({ fn: 'changeUserPassword' }), { wrapper })
  const params = { newPassword: 'new-password' }
  await act(async () => {
    const pending = result.current.callAsync(params)
    lookup.reject(new Error('offline'))
    expect(await pending).toEqual(new Error('offline'))
  })
  expect(change).not.toHaveBeenCalled()
  await act(async () => { await result.current.callAsync(params) })
  expect(query).toHaveBeenCalledTimes(2)
  expect(change).toHaveBeenCalledOnce()
  expect(result.current).toMatchObject({ isSuccess: true, error: null })
})

it('ignores late lookups after an account switch, refreshes keys, and clears them on logout', async () => {
  const { client, wrapper } = fixture()
  client.sessionStorage.set(session())
  const first = deferred<ReturnType<typeof keysResponse>>()
  const query = vi.spyOn(client.graphql, 'request').mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(keysResponse([])).mockResolvedValueOnce(keysResponse([key]))
  const { result } = renderHook(useNhostSecurity, { wrapper })
  expect(result.current.isLoading).toBe(true)
  act(() => client.sessionStorage.set(session('second')))
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  await act(async () => { first.resolve(keysResponse([key])); await first.promise })
  expect(result.current.hasSecurityKeys).toBe(false)
  await act(() => result.current.refreshSecurityKeys())
  expect(result.current).toMatchObject({ securityKeys: [key], requiresElevation: true })
  act(() => client.sessionStorage.remove())
  expect(result.current).toMatchObject({ securityKeys: [], isLoading: false, requiresElevation: false })
  await act(() => result.current.checkElevation())
  await act(() => result.current.refreshSecurityKeys())
  expect(query).toHaveBeenCalledTimes(3)
})

it('stops an in-flight elevation when the signed-in account changes', async () => {
  const { client, wrapper } = fixture()
  client.sessionStorage.set(session())
  const first = deferred<ReturnType<typeof keysResponse>>()
  vi.spyOn(client.graphql, 'request').mockReturnValueOnce(first.promise).mockResolvedValue(keysResponse([]))
  const change = vi.spyOn(client.auth, 'changeUserPassword')
  const { result } = renderHook(() => useNhostAuthElevated({ fn: 'changeUserPassword' }), { wrapper })
  await act(async () => {
    const pending = result.current.callAsync({ newPassword: 'new-password' })
    client.sessionStorage.set(session('second'))
    first.resolve(keysResponse([key]))
    expect(await pending).toEqual(new Error('Session changed during elevation'))
  })
  expect(change).not.toHaveBeenCalled()
})

it('reports incomplete discovery and verification responses without running the protected method', async () => {
  const { client, wrapper } = fixture()
  client.sessionStorage.set(session())
  vi.spyOn(client.graphql, 'request').mockResolvedValueOnce(response({})).mockResolvedValue(keysResponse([key]))
  vi.spyOn(client.auth, 'elevateWebauthn').mockResolvedValue(response({ challenge: 'test' }))
  vi.mocked(startAuthentication).mockResolvedValue({ id: 'key' } as Awaited<ReturnType<typeof startAuthentication>>)
  vi.spyOn(client.auth, 'verifyElevateWebauthn').mockResolvedValue(response({}))
  const change = vi.spyOn(client.auth, 'changeUserPassword')
  const { result } = renderHook(() => useNhostAuthElevated({ fn: 'changeUserPassword' }), { wrapper })
  await act(async () => {
    expect(await result.current.callAsync({ newPassword: 'new-password' })).toEqual(new Error('Could not load security keys'))
    expect(await result.current.callAsync({ newPassword: 'new-password' })).toEqual(new Error('Failed to get elevated session'))
  })
  expect(change).not.toHaveBeenCalled()
})

it('keeps refreshed keys when a superseded lookup fails', async () => {
  const { client, wrapper } = fixture()
  client.sessionStorage.set(session())
  const stale = deferred<ReturnType<typeof keysResponse>>()
  vi.spyOn(client.graphql, 'request').mockReturnValueOnce(stale.promise).mockResolvedValue(keysResponse([key]))
  const { result } = renderHook(useNhostSecurity, { wrapper })
  await act(() => result.current.refreshSecurityKeys())
  await act(async () => { stale.reject(new Error('old request failed')) })
  expect(result.current).toMatchObject({ securityKeys: [key], requiresElevation: true, isLoading: false })
})

it('uses disabled mode without requesting keys or prompting', async () => {
  const { client, wrapper } = fixture(undefined, 'disabled')
  client.sessionStorage.set(session())
  const keys = vi.spyOn(client.graphql, 'request')
  const challenge = vi.spyOn(client.auth, 'elevateWebauthn')
  const change = vi.spyOn(client.auth, 'changeUserPassword').mockResolvedValue(response('OK' as const))
  const { result } = renderHook(() => useNhostAuthElevated({ fn: 'changeUserPassword' }), { wrapper })
  await act(async () => { await result.current.callAsync({ newPassword: 'test-password' }) })
  expect(change).toHaveBeenCalledOnce()
  expect(keys).not.toHaveBeenCalled()
  expect(challenge).not.toHaveBeenCalled()
})

it('requires authentication and an enrolled key for sensitive changes in required mode', async () => {
  const { client, wrapper } = fixture(undefined, 'required')
  vi.spyOn(client.graphql, 'request').mockResolvedValue(keysResponse([]))
  const change = vi.spyOn(client.auth, 'changeUserPassword')
  const { result } = renderHook(() => useNhostAuthElevated({ fn: 'changeUserPassword' }), { wrapper })
  await act(async () => { expect(await result.current.callAsync({ newPassword: 'sample' })).toEqual(new Error('Sign in before requesting elevated permissions.')) })
  act(() => client.sessionStorage.set(session()))
  await act(async () => { expect(await result.current.callAsync({ newPassword: 'sample' })).toEqual(new Error('Register a security key before requesting elevated permissions.')) })
  expect(change).not.toHaveBeenCalled()
})

it.each(['addSecurityKey', 'verifyAddSecurityKey'] as const)('allows first-key enrollment with %s in required mode', async method => {
  const { client, wrapper } = fixture(undefined, 'required')
  client.sessionStorage.set(session())
  vi.spyOn(client.graphql, 'request').mockResolvedValue(keysResponse([]))
  const { result } = renderHook(() => useNhostSecurity(method), { wrapper })
  await act(async () => { await expect(result.current.checkElevation()).resolves.toBeUndefined() })
  expect(result.current.requiresElevation).toBe(false)
})

it('rechecks the active token after refresh even when a caller retains the old callback', async () => {
  const { client, wrapper } = fixture(undefined, 'required')
  client.sessionStorage.set(session('user-a', true))
  vi.spyOn(client.graphql, 'request').mockResolvedValue(keysResponse([key]))
  const challenge = vi.spyOn(client.auth, 'elevateWebauthn').mockRejectedValue(new Error('challenge needed'))
  const { result } = renderHook(useNhostSecurity, { wrapper })
  const check = result.current.checkElevation
  expect(result.current.isElevated).toBe(true)
  act(() => client.sessionStorage.set(session()))
  expect(result.current.isElevated).toBe(false)
  await act(async () => { await expect(check()).rejects.toThrow('challenge needed') })
  expect(challenge).toHaveBeenCalledOnce()
})

it.each(['user-b', 'missing-claim'])('rejects an inappropriate session after WebAuthn verification (%s)', async returned => {
  const { client, wrapper } = fixture(undefined, 'required')
  client.sessionStorage.set(session())
  vi.spyOn(client.graphql, 'request').mockResolvedValue(keysResponse([key]))
  vi.spyOn(client.auth, 'elevateWebauthn').mockResolvedValue(response({ challenge: 'challenge' }))
  vi.mocked(startAuthentication).mockResolvedValue({ id: 'key' } as Awaited<ReturnType<typeof startAuthentication>>)
  vi.spyOn(client.auth, 'verifyElevateWebauthn').mockResolvedValue(response({ session: returned === 'user-b' ? session('user-b', true) : session() }))
  const change = vi.spyOn(client.auth, 'changeUserPassword')
  const { result } = renderHook(() => useNhostAuthElevated({ fn: 'changeUserPassword' }), { wrapper })
  await act(async () => { expect(await result.current.callAsync({ newPassword: 'sample' })).toBeInstanceOf(Error) })
  expect(change).not.toHaveBeenCalled()
  expect(client.getUserSession()?.user?.id).toBe('user-a')
})
