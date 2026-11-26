import { LocalStorage } from '@nhost/nhost-js/session'
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useNhost } from '../src'
import { deferred, fixture, response, session } from './fixtures'

it('requires a provider', () => {
  expect(() => renderHook(useNhost)).toThrow('useNhost must be used within NhostProvider')
})

it('restores a stored session, observes same-token profile changes, and unsubscribes', () => {
  const { client, wrapper } = fixture()
  client.sessionStorage.set(session())
  const onChange = vi.spyOn(client.sessionStorage, 'onChange')
  const { result, unmount } = renderHook(useNhost, { wrapper })
  expect(result.current).toMatchObject({ isLoading: false, isAuthenticated: true, userId: 'user-a' })
  act(() => client.sessionStorage.set({ ...session(), user: { ...session().user!, displayName: 'New name' } }))
  expect(result.current.user?.displayName).toBe('New name')
  act(() => client.sessionStorage.remove())
  expect(result.current).toMatchObject({ session: null, user: null, isAuthenticated: false })
  const remove = vi.spyOn(window, 'removeEventListener')
  unmount()
  expect(remove).toHaveBeenCalledWith('storage', expect.any(Function))
  expect(onChange).toHaveBeenCalledTimes(1)
})

it('reads the configured storage on cross-tab changes and clear events', () => {
  const { client, wrapper } = fixture(new LocalStorage({ storageKey: 'custom-key' }))
  const { result } = renderHook(useNhost, { wrapper })
  const otherTab = fixture(new LocalStorage({ storageKey: 'custom-key' }))
  otherTab.client.sessionStorage.set(session('other'))
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'custom-key' })) })
  expect(result.current.session).toEqual(client.getUserSession())
  expect(result.current.userId).toBe('other')
  localStorage.clear()
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: null })) })
  expect(result.current.isAuthenticated).toBe(false)
})

it('ignores foreign session payloads with a memory-backed client', () => {
  const { wrapper } = fixture()
  const { result } = renderHook(useNhost, { wrapper })
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'nhostSession', newValue: JSON.stringify(session()) })) })
  expect(result.current.session).toBeNull()
})

it('recovers from sign-out failure and observes a subsequent successful sign-out', async () => {
  const { client, wrapper } = fixture()
  client.sessionStorage.set(session())
  const pending = deferred<never>()
  const signOut = vi.spyOn(client.auth, 'signOut').mockReturnValueOnce(pending.promise)
    .mockImplementation(async () => { client.sessionStorage.remove(); return response('OK' as const) })
  const { result } = renderHook(useNhost, { wrapper })
  let call!: Promise<void>
  act(() => { call = result.current.signOut() })
  expect(result.current.isLoading).toBe(true)
  await act(async () => {
    pending.reject(new Error('offline'))
    await expect(call).rejects.toThrow('offline')
  })
  expect(result.current).toMatchObject({ isLoading: false, isAuthenticated: true })
  await act(() => result.current.signOut())
  expect(result.current.session).toBeNull()
  await act(() => result.current.signOut())
  expect(signOut).toHaveBeenCalledTimes(2)
  expect(signOut).toHaveBeenCalledWith({ refreshToken: 'refresh-user-a' })
})

it('exchanges the URL token once under Strict Mode and preserves history and other URL parts', async () => {
  history.replaceState({ route: 1 }, '', '/callback?next=home&refreshToken=sample#done')
  const { client, wrapper } = fixture()
  const gate = deferred<void>()
  const refresh = vi.spyOn(client.auth, 'refreshToken').mockImplementation(async () => {
    await gate.promise
    client.sessionStorage.set(session())
    return response(session())
  })
  const { result } = renderHook(useNhost, { wrapper, reactStrictMode: true })
  expect(result.current.isLoading).toBe(true)
  await act(async () => { gate.resolve(); await gate.promise })
  expect(refresh.mock.calls).toEqual([[{ refreshToken: 'sample' }]])
  expect(location.pathname + location.search + location.hash).toBe('/callback?next=home#done')
  expect(history.state).toEqual({ route: 1 })
  expect(result.current).toMatchObject({ userId: 'user-a', isLoading: false })
})

it('refreshes after idle, deduplicates concurrent focus events, and supports forced refresh', async () => {
  const { client, wrapper } = fixture()
  const gate = deferred<null>()
  const refresh = vi.spyOn(client, 'refreshSession').mockReturnValue(gate.promise)
  const { result } = renderHook(useNhost, { wrapper })
  const refocus = () => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')) }
  act(refocus)
  expect(refresh).not.toHaveBeenCalled()
  act(() => client.sessionStorage.set(session()))
  act(() => { refocus(); refocus() })
  expect(refresh.mock.calls).toEqual([[]])
  await act(async () => { gate.resolve(null); await gate.promise })
  await act(() => result.current.refreshSession())
  expect(refresh.mock.calls).toEqual([[], [0]])
})

it('refreshes when a hidden tab becomes visible and ignores unrelated focus events', async () => {
  const { client, wrapper } = fixture()
  client.sessionStorage.set(session())
  const refresh = vi.spyOn(client, 'refreshSession').mockResolvedValue(null)
  const { unmount } = renderHook(useNhost, { wrapper })
  const hidden = vi.spyOn(document, 'hidden', 'get')
  try {
    const visibility = () => document.dispatchEvent(new Event('visibilitychange'))
    hidden.mockReturnValue(true)
    visibility()
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    expect(refresh).not.toHaveBeenCalled()
    hidden.mockReturnValue(false)
    visibility()
    await Promise.resolve()
    window.dispatchEvent(new Event('focus'))
    visibility()
    expect(refresh).toHaveBeenCalledTimes(1)
    unmount()
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)
  } finally {
    hidden.mockRestore()
  }
})

it('cleans up a rejected URL token exchange and exits initialization', async () => {
  history.replaceState(null, '', '/?refreshToken=expired')
  const { client, wrapper } = fixture()
  vi.spyOn(client.auth, 'refreshToken').mockRejectedValue(new Error('expired'))
  const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
  try {
    const { result } = renderHook(useNhost, { wrapper })
    await act(async () => {})
    expect(reload).toHaveBeenCalledOnce()
    expect(location.search).toBe('')
    expect(result.current).toMatchObject({ session: null, isLoading: false })
  } finally {
    reload.mockRestore()
  }
})

it('leaves navigation alone when a token exchange fails after unmount', async () => {
  history.replaceState(null, '', '/?refreshToken=old')
  const { client, wrapper } = fixture()
  const gate = deferred<never>()
  vi.spyOn(client.auth, 'refreshToken').mockReturnValue(gate.promise)
  const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
  try {
    const { unmount } = renderHook(useNhost, { wrapper })
    unmount()
    await act(async () => { gate.reject(new Error('expired')) })
    expect(reload).not.toHaveBeenCalled()
  } finally {
    reload.mockRestore()
  }
})
