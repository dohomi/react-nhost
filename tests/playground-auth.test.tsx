import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { generateCodeChallenge } from '@nhost/nhost-js/auth'
import type { PropsWithChildren } from 'react'
import { NhostProvider, useNhost } from '../src'
import { RegisterForm } from '../playground/src/RegisterForm'
import { fixture, response, session } from './fixtures'

afterEach(() => localStorage.clear())

function submitCredentials(action: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-password' } })
  fireEvent.click(screen.getByRole('button', { name: action }))
}

it.each([true, false])('distinguishes pending email verification from immediate registration (pending: %s)', async pending => {
  const { client, wrapper } = fixture()
  const signup = vi.spyOn(client.auth, 'signUpEmailPassword')
    .mockResolvedValue(response(pending ? {} : { session: session() }))
  render(<RegisterForm />, { wrapper })
  fireEvent.click(screen.getByRole('button', { name: 'Register with email' }))
  submitCredentials('Create account')
  await waitFor(() => expect(signup).toHaveBeenCalledOnce())
  expect(signup).toHaveBeenCalledWith({
    email: 'alice@example.com', password: 'example-password',
    codeChallenge: expect.stringMatching(/^[a-zA-Z0-9_-]{43}$/),
    options: { redirectTo: location.origin + '/verify' },
  })
  expect(localStorage.length).toBe(pending ? 1 : 0)
  expect(Boolean(screen.queryByText(/Check alice@example.com/))).toBe(pending)
})

it('continues an MFA challenge without starting a PKCE request', async () => {
  const { client, wrapper } = fixture()
  const login = vi.spyOn(client.auth, 'signInEmailPassword').mockResolvedValue(response({ mfa: { ticket: 'mfa-ticket' } }))
  const verify = vi.spyOn(client.auth, 'verifySignInMfaTotp').mockResolvedValue(response({ session: session() }))
  render(<RegisterForm />, { wrapper })
  submitCredentials('Sign in')
  fireEvent.change(await screen.findByLabelText('Authenticator code'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify authenticator code' }))
  await waitFor(() => expect(verify).toHaveBeenCalledWith({ ticket: 'mfa-ticket', otp: '123456' }))
  expect(login).toHaveBeenCalledWith({ email: 'alice@example.com', password: 'example-password' })
  expect(localStorage.length).toBe(0)
})

it.each(['Apple', 'Google'])('starts the configured %s OAuth redirect with a challenge', async provider => {
  const { wrapper } = fixture()
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  try {
    render(<RegisterForm />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Continue with ' + provider }))
    await waitFor(() => expect(assign).toHaveBeenCalledOnce())
    const url = new URL(String(assign.mock.calls[0]![0]))
    expect(url.pathname).toContain('/signin/provider/' + provider.toLowerCase())
    expect(url.searchParams.get('redirectTo')).toBe(location.origin + '/verify')
    expect(url.searchParams.get('codeChallenge')).toMatch(/^[a-zA-Z0-9_-]{43}$/)
    expect(localStorage.length).toBe(1)
  } finally {
    assign.mockRestore()
  }
})

it('signs up through the playground and establishes a session on a fresh callback page', async () => {
  const transport = vi.fn()
    .mockResolvedValueOnce(Response.json({ session: null }))
    .mockResolvedValueOnce(Response.json({ session: session('alice') }))
  vi.stubGlobal('fetch', transport)
  try {
    const page = render(<RegisterForm />, { wrapper: fixture().wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Register with email' }))
    submitCredentials('Create account')
    await screen.findByText(/Check alice@example.com/)
    const signup = JSON.parse(transport.mock.calls[0]![1].body)
    page.unmount()
    history.replaceState(null, '', signup.options.redirectTo + '?code=email-code')
    const { client } = fixture()
    const wrapper = ({ children }: PropsWithChildren) =>
      <NhostProvider nhostClient={client} pkceCallbackPath="/verify">{children}</NhostProvider>
    const { result } = renderHook(useNhost, { wrapper })
    await waitFor(() => expect(result.current.userId).toBe('alice'))
    expect(result.current.isAuthenticated).toBe(true)
    expect(transport).toHaveBeenCalledTimes(2)
    const exchange = JSON.parse(transport.mock.calls[1]![1].body)
    expect(exchange.code).toBe('email-code')
    expect(await generateCodeChallenge(exchange.codeVerifier)).toBe(signup.codeChallenge)
    expect(localStorage.length).toBe(0)
  } finally {
    vi.unstubAllGlobals()
    history.replaceState(null, '', '/')
  }
})
