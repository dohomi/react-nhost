import { expectTypeOf } from 'vitest'
import type { NhostClient } from '@nhost/nhost-js'
import type { ErrorResponse } from '@nhost/nhost-js/auth'
import { useNhostAuth, useNhostAuthElevated, useNhostStorage } from 'react-nhost'

// Compiled against the package entry point and generated declarations.
export function useConsumerTypes() {
  type SignIn = NhostClient['auth']['signInEmailPassword']
  const auth = useNhostAuth({ fn: 'signInEmailPassword', onSuccess: ({ data, params }) => {
    expectTypeOf(data).toEqualTypeOf<Awaited<ReturnType<SignIn>>>()
    expectTypeOf(params).toEqualTypeOf<Parameters<SignIn>[0]>()
  } })
  const elevated = useNhostAuthElevated({ fn: 'signInEmailPassword' })
  expectTypeOf(elevated.callAsync).toEqualTypeOf<typeof auth.callAsync>()
  expectTypeOf(auth.callAsync).parameters.toEqualTypeOf<Parameters<SignIn>>()
  type AuthResult = Awaited<ReturnType<typeof auth.callAsync>>
  expectTypeOf<Exclude<AuthResult, Error>>().toEqualTypeOf<Awaited<ReturnType<SignIn>>>()
  expectTypeOf<Extract<AuthResult, Error>>().not.toBeNever()
  const storage = useNhostStorage({ fn: 'getVersion', onSuccess: ({ params }) => {
    expectTypeOf(params).toEqualTypeOf<RequestInit | undefined>()
  } })
  expectTypeOf<Exclude<Awaited<ReturnType<typeof storage.callAsync>>, Error>>()
    .toEqualTypeOf<Awaited<ReturnType<NhostClient['storage']['getVersion']>>>()
  expectTypeOf(auth.error?.body).toEqualTypeOf<ErrorResponse | undefined>()
  // @ts-expect-error password is required
  void auth.callAsync({ email: 'user@example.com' })
  // @ts-expect-error baseURL is a property, not an SDK method
  useNhostStorage({ fn: 'baseURL' })
}
