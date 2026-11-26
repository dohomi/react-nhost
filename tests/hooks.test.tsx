import { act, renderHook } from '@testing-library/react'
import { FetchError } from '@nhost/nhost-js/fetch'
import { expect, it, vi } from 'vitest'
import { useNhost, useNhostAuth, useNhostStorage } from '../src'
import { deferred, fixture, response, session } from './fixtures'

it('forwards auth arguments, typed response, and the latest callbacks', async () => {
  const { client, wrapper } = fixture()
  const data = response({})
  const signIn = vi.spyOn(client.auth, 'signInEmailPassword').mockResolvedValue(data)
  const first = vi.fn(), second = vi.fn()
  const { result, rerender } = renderHook(({ onSuccess }) => useNhostAuth({ fn: 'signInEmailPassword', onSuccess }), {
    wrapper, initialProps: { onSuccess: first },
  })
  const call = result.current.callAsync
  rerender({ onSuccess: second })
  expect(result.current.callAsync).toBe(call)
  const params = { email: 'test@example.com', password: 'sample' }
  const options = { cache: 'no-store' as const }
  await act(async () => { expect(await call(params, options)).toBe(data) })
  expect(signIn).toHaveBeenCalledWith(params, options)
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledWith({ nhost: client, data, params })
  expect(result.current).toMatchObject({ isSuccess: true, error: null, isLoading: false })
})

it.each([true, false])('keeps loading until all storage calls settle (older fails: %s)', async olderFails => {
  const { client, wrapper } = fixture()
  const older = deferred<ReturnType<typeof response<void>>>(), newer = deferred<ReturnType<typeof response<void>>>()
  vi.spyOn(client.storage, 'deleteFile').mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
  const onError = vi.fn(), onSuccess = vi.fn()
  const { result } = renderHook(() => useNhostStorage({ fn: 'deleteFile', onSuccess, onError }), { wrapper })
  const error = new FetchError({ error: { message: 'unavailable' } }, 503, new Headers())
  const data = response(undefined)
  let first!: ReturnType<typeof result.current.callAsync>, last!: typeof first
  act(() => { first = result.current.callAsync('first'); last = result.current.callAsync('last') })
  await act(async () => {
    if (olderFails) newer.resolve(data); else newer.reject(error)
    expect(await last).toBe(olderFails ? data : error)
  })
  expect(result.current.isLoading).toBe(true)
  await act(async () => {
    if (olderFails) older.reject(error); else older.resolve(data)
    expect(await first).toBe(olderFails ? error : data)
  })
  expect(result.current).toMatchObject({ isLoading: false, isSuccess: olderFails, error: olderFails ? null : error })
  expect(onError).toHaveBeenCalledWith({ error, nhost: client, params: olderFails ? 'first' : 'last' })
  expect(onSuccess).toHaveBeenCalledWith({ data, nhost: client, params: olderFails ? 'last' : 'first' })
})

it('synchronizes the provider through the real SDK sign-in and sign-out middleware', async () => {
  const transport = vi.fn()
    .mockResolvedValueOnce(Response.json({ session: session() }))
    .mockResolvedValueOnce(Response.json('OK'))
  vi.stubGlobal('fetch', transport)
  try {
    const { wrapper } = fixture()
    const { result } = renderHook(() => ({
      context: useNhost(),
      signIn: useNhostAuth({ fn: 'signInEmailPassword' }),
    }), { wrapper })
    await act(async () => { await result.current.signIn.callAsync({ email: 'user-a@example.com', password: 'test' }) })
    expect(result.current.context.userId).toBe('user-a')
    await act(() => result.current.context.signOut())
    expect(result.current.context.session).toBeNull()
    expect(transport.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/v1/signin/email-password', '/v1/signout'])
  } finally {
    vi.unstubAllGlobals()
  }
})

it('normalizes a non-Error rejection and recovers on the next call', async () => {
  const { client, wrapper } = fixture()
  const version = response({ buildVersion: 'test' })
  vi.spyOn(client.storage, 'getVersion').mockRejectedValueOnce('offline').mockResolvedValueOnce(version)
  const { result } = renderHook(() => useNhostStorage({ fn: 'getVersion' }), { wrapper })
  await act(async () => { expect(await result.current.callAsync()).toEqual(new Error('offline')) })
  expect(result.current.error?.message).toBe('offline')
  await act(async () => { expect(await result.current.callAsync()).toBe(version) })
  expect(result.current).toMatchObject({ error: null, isSuccess: true, isLoading: false })
})
