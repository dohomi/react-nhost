import { createClient } from '@nhost/nhost-js'
import type { Session } from '@nhost/nhost-js/auth'
import { MemoryStorage, type SessionStorageBackend } from '@nhost/nhost-js/session'
import type { PropsWithChildren } from 'react'
import { NhostProvider, type ElevationMode } from '../src'

export function session(id = 'user-a', elevated = false): Session {
  const token = btoa(JSON.stringify({ exp: 4102444800, 'https://hasura.io/jwt/claims': { ...(elevated && { 'x-hasura-auth-elevated': id }) } }))
  return {
    accessToken: `test.${token}.test`, accessTokenExpiresIn: 600,
    refreshToken: 'refresh-' + id, refreshTokenId: 'token-' + id,
    user: {
      id, email: id + '@example.com', avatarUrl: '', createdAt: '2025-01-01',
      defaultRole: 'user', displayName: id, emailVerified: true, isAnonymous: false,
      locale: 'en', metadata: {}, phoneNumberVerified: false, roles: ['user'],
    },
  }
}

export function fixture(storage: SessionStorageBackend = new MemoryStorage(), elevationMode: ElevationMode = "recommended") {
  const client = createClient({ subdomain: 'local', storage })
  const wrapper = ({ children }: PropsWithChildren) => <NhostProvider nhostClient={client} elevationMode={elevationMode}>{children}</NhostProvider>
  return { client, wrapper }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

export function response<T>(body: T) {
  return { body, status: 200, headers: new Headers() }
}
