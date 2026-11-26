import React from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@nhost/nhost-js'
import { startRegistration } from '@simplewebauthn/browser'
import { NhostProvider, useNhostAuthElevated } from '../../../src'

const client = createClient({
  subdomain: 'local',
  authUrl: 'http://localhost:19902/v1',
  graphqlUrl: 'http://localhost:19904/v1/graphql',
})

window.enroll = async ({ email, password }) => {
  await client.auth.signUpEmailPassword({ email, password })
  if (!client.getUserSession()) throw new Error('Signup did not establish a session')
  const { body: optionsJSON } = await client.auth.addSecurityKey()
  const credential = await startRegistration({ optionsJSON })
  await client.auth.verifyAddSecurityKey({ credential, nickname: 'Playwright' })
  return client.getUserSession().user.id
}

function ChangePassword() {
  const change = useNhostAuthElevated({ fn: 'changeUserPassword' })
  return <form onSubmit={async event => {
    event.preventDefault()
    await change.callAsync({ newPassword: event.currentTarget.elements.password.value })
  }}>
    <input type="password" name="password" aria-label="New password" />
    <button>Change password</button>
    <output>{change.error?.message || (change.isSuccess && 'Password changed')}</output>
  </form>
}

createRoot(document.getElementById('root')).render(
  <NhostProvider nhostClient={client} elevationMode="required"><ChangePassword /></NhostProvider>,
)
