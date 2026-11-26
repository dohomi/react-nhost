<h1 align="center">react-nhost</h1>

[![npm version](https://img.shields.io/npm/v/react-nhost.svg)](https://www.npmjs.com/package/react-nhost)
[![npm downloads](https://img.shields.io/npm/dm/react-nhost.svg)](https://www.npmjs.com/package/react-nhost)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/react-nhost)](https://www.npmjs.com/package/react-nhost)
[![License](https://img.shields.io/npm/l/react-nhost.svg)](https://github.com/dohomi/react-nhost/blob/main/LICENSE)

A React wrapper for the [Nhost JavaScript SDK](https://docs.nhost.io/reference/javascript/nhost-js/main) (`@nhost/nhost-js`). This library provides React hooks that are typed wrappers for Nhost auth and storage methods, making it easy to use Nhost in your React applications.

The hooks in this library directly map to the Nhost SDK methods. For detailed API documentation, parameter types, and return values, refer to the **[Nhost SDK documentation](https://docs.nhost.io/reference/javascript/nhost-js/main)** - it shows the exact API for each function used by the hooks in this library.

For TypeScript users, all function names, parameters, and return types are **fully typed** with complete type safety and autocomplete support.

## Installation

In a React 18 or 19 application, install the package and its Nhost and WebAuthn peers:

```bash
npm install react-nhost @nhost/nhost-js@^4.6.0 @simplewebauthn/browser@^14
```

## Overview

This library provides a `NhostProvider` component and several React hooks to work with Nhost in your React application:

### Provider
- **⚛️ [`NhostProvider`](#nhostprovider)** - Wraps your application and provides the Nhost context to all hooks

### Hooks
- **👤 [`useNhost`](#usenhost)** - Base hook to access authentication state, user, session, and the Nhost client instance
- **🔒 [`useNhostAuth`](#usenhostauth)** - Type-safe wrapper for authentication methods (sign in, sign up, reset password, etc.) - [Nhost SDK Auth Documentation](https://docs.nhost.io/reference/javascript/nhost-js/auth)
- **🔐 [`useNhostAuthElevated`](#usenhostauthelevated)** - For authentication methods requiring elevated permissions (change password, change email, etc.) - [Nhost SDK Auth Documentation](https://docs.nhost.io/reference/javascript/nhost-js/auth)
- **📦 [`useNhostStorage`](#usenhoststorage)** - Type-safe wrapper for storage operations (upload files, delete, get a presigned URL, etc.) - [Nhost SDK Storage Documentation](https://docs.nhost.io/reference/javascript/nhost-js/storage)
- **🛡️ [`useNhostSecurity`](#usenhostsecurity)** - Manages WebAuthn security keys and elevated permissions

## Setup

You need for all hooks to work the `NhostProvider`. Most likely this will wrap your entire app. If you use ReactRouter, Tanstack Router or any other routing library the `NhostProvider` will be one level up.

### ⚛️ `NhostProvider` 

```tsx App.tsx
import { NhostProvider } from "react-nhost"
import { createClient } from "@nhost/nhost-js"

const nhostClient = createClient({
  subdomain: "YOUR_SUBDOMAIN",
  region: "YOUR_REGION"
})

export function App() {
  return (
    <NhostProvider nhostClient={nhostClient}>
      <RestOfYourApplication />
    </NhostProvider>
  )
}
```


## Email verification and redirect sign-in

An existing user signs in with email and password using `signInEmailPassword` as before.
PKCE matters when Nhost sends the browser away and brings it back, for example through a
verification email or an Apple or Google sign-in. The browser keeps a random secret (the
*verifier*) and sends Nhost its hash (the *challenge*). On return, Nhost trades the short-lived
code and the original verifier for a session. The code is single-use and expires after five minutes. Copying the code alone is insufficient.

Use SDK 4.6 or later in the 4.x series and a PKCE-capable Nhost Auth service. Add the
absolute callback URL (e.g. `http://localhost:5173/verify`) to your Nhost allowed redirect URLs.
Serve the application on that path and place the provider above any route guard:

```tsx
<NhostProvider nhostClient={nhostClient} pkceCallbackPath="/verify">
  <App />
</NhostProvider>
```

At registration, send the challenge at the top level and the callback URL inside `options`:

```tsx
import { preparePKCE, useNhost, useNhostAuth } from "react-nhost"

function useEmailRegistration() {
  const { nhost } = useNhost()
  const { callAsync } = useNhostAuth({ fn: "signUpEmailPassword" })
  return async (email: string, password: string) => {
    const attempt = await preparePKCE(nhost)
    const redirectTo = new URL("/verify", window.location.origin).href
    const result = await callAsync({ email, password, codeChallenge: attempt.codeChallenge, options: { redirectTo } })
    if (result instanceof Error || result.body.session) attempt.clear()
    if (result instanceof Error) throw result
    return result.body.session ? "signed-in" : "check-email"
  }
}
```

Open the verification link in the same browser profile and origin. A new tab works because
the verifier is stored in local storage. The most recently started redirect for this Nhost
project owns the verifier. If the verifier is unavailable, the user can return to the original
browser or sign in with their password after confirming the email. The callback consumes the verifier before exchange, including failed exchanges. Start a fresh redirect if the code is expired. See the [Nhost PKCE guide](https://docs.nhost.io/products/auth/pkce).

For an enabled OAuth provider, start the redirect from a button handler using the same helper:

```ts
const { codeChallenge } = await preparePKCE(nhost)
const redirectTo = new URL("/verify", window.location.origin).href
window.location.assign(nhost.auth.signInProviderURL("google", { codeChallenge, redirectTo }))
```

Use `"apple"` for Apple. The provider exchanges `?code=` on the configured callback path,
removes it from the URL, and exposes the result via `useNhost()`: show a pending state while
`isLoading`, a recovery message for `callbackError`, and the account view when
`isAuthenticated`. Existing `?refreshToken=` redirects continue to work without opting in.

Run `pnpm play` for the example. It defaults to a local Nhost project. For a cloud project,
set `VITE_NHOST_SUBDOMAIN` and `VITE_NHOST_REGION` when starting Vite. Enable email verification
and the desired OAuth providers in that project to exercise their redirects. For projects protecting registration with Cloudflare Turnstile, set `VITE_TURNSTILE_SITE_KEY` to the public site key and allow the playground hostname in the widget configuration.

### Run the live email verification test locally

With Docker Compose, Bash, and Google Chrome installed, run `pnpm test:e2e:email` from the repository root after `pnpm install`. To use a different Chromium installation, set `CHROME_BIN` to its executable path. The test needs free loopback ports 5197, 19902, and 19903.

The script starts a fresh local Nhost Auth, Postgres, Hasura, and MailHog stack, submits the playground registration form, and opens the verification email in a second browser tab. It checks the PKCE exchange, session persistence, and sign-out. Compose removes the test containers and database volume when the script exits. No Nhost project credentials are needed.

## Hooks

### 👤 `useNhost`

The `useNhost` hook provides access to the Nhost context. This is the base hook that gives you access to the authentication state and the Nhost client instance.

#### API

**Parameters:**
This hook takes no parameters.

**Returns:**
- `user`: Current user object or `null` if not authenticated
- `session`: Current session object or `null` if not authenticated
- `isAuthenticated`: Boolean indicating if user is authenticated
- `isLoading`: Boolean indicating if authentication state is being loaded
- `callbackError`: PKCE verification error, or `null`
- `userId`: Current user ID or `undefined` if not authenticated
- `nhost`: The Nhost client instance for direct access to Nhost methods
- `signOut`: Function to sign out the current user
- `refreshSession`: Function to refresh the current session

#### Example: User Profile

```tsx
import { useNhost } from "react-nhost"

export function UserProfile() {
  const { user, isAuthenticated, isLoading } = useNhost()

  if (isLoading) return <div>Loading...</div>
  if (!isAuthenticated) return <div>Please sign in</div>

  return (
    <div>
      <h1>Welcome, {user?.displayName || user?.email}!</h1>
      <p>User ID: {user?.id}</p>
    </div>
  )
}
```

#### Example: AuthGuard

```tsx
import { useNhost } from "react-nhost"
import type { PropsWithChildren } from "react"

export function AuthGuard({ children }: PropsWithChildren) {
  const { isAuthenticated, isLoading } = useNhost()
  
  if (isLoading) {
    return <Spinner />
  }
  
  if (!isAuthenticated) {
    return <LoginPage />
  }
  
  return <>{children}</>
}
```

### 🔒 `useNhostAuth`

This hook creates a type-safe wrapper for any function callable inside the `nhost.auth` directive. It provides loading states, error handling, and success callbacks.

For the complete API reference, see the **[Nhost SDK Auth Documentation](https://docs.nhost.io/reference/javascript/nhost-js/auth)**.

#### API

**Parameters:**
- `fn`: A string specifying which authentication method to call (e.g., `"signInEmailPassword"`, `"signUpEmailPassword"`, `"sendPasswordResetEmail"`, etc.)
- `onSuccess`: Optional callback function that runs when the operation succeeds. Receives:
  - `nhost`: The Nhost client instance
  - `data`: The response data from the authentication method
  - `params`: The parameters that were passed to the method
- `onError`: Optional callback function that runs when the operation fails. Receives:
  - `nhost`: The Nhost client instance
  - `error`: The error object with details about what went wrong
  - `params`: The parameters that were passed to the method

**Returns:**
- `callAsync`: Function to call the authentication method with the required parameters
- `isLoading`: Boolean indicating if the operation is in progress
- `isSuccess`: Boolean indicating if the last operation succeeded
- `error`: Error object (or `null`) containing details if the operation failed

#### Example

```tsx
import { useNhost, useNhostAuth } from "react-nhost"
import { useState } from "react"

export function SignInComponent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  
  const { isAuthenticated } = useNhost()
  const [needsMfa, setNeedsMfa] = useState(false)
  const { callAsync, isLoading, error } = useNhostAuth({
    fn: "signInEmailPassword",
    onSuccess: ({ data }) => setNeedsMfa(Boolean(data.body.mfa))
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await callAsync({
      email,
      password
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        disabled={isLoading}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        disabled={isLoading}
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign In"}
      </button>
      {error && <div className="error">{error.message}</div>}
      {needsMfa && !isAuthenticated && <p>Continue with your authenticator code.</p>}
      {isAuthenticated && <p>Signed in successfully!</p>}
    </form>
  )
}
```

### 🔐 `useNhostAuthElevated`

This hook is similar to `useNhostAuth` but is specifically designed for authentication methods that require elevated permissions. It automatically handles elevation if required before executing the authentication method. This is useful for sensitive operations like `changeUserPassword`, `changeUserEmail`, and other methods that require elevated permissions.

For the complete API reference, see the **[Nhost SDK Auth Documentation](https://docs.nhost.io/reference/javascript/nhost-js/auth)**.

Set the provider’s `elevationMode` to the value of `[auth.elevatedPrivileges].mode` in your Nhost project. The default is `"disabled"`, matching Nhost. Apps upgrading from the earlier automatic key-based behavior should explicitly select `"recommended"`.

| Mode | Behavior for sensitive requests |
| --- | --- |
| `disabled` | Call the SDK directly. |
| `recommended` | Prompt users who have an enrolled security key. |
| `required` | Require an elevated token. Users without a key can enroll their first key through `addSecurityKey` and `verifyAddSecurityKey`. |

The authenticated role needs permission to read its own security-key IDs and nicknames for key discovery. The hook checks that the access token’s `x-hasura-auth-elevated` claim equals the current user ID. Renewing the access token normally drops the claim and requires a new challenge. Configure Nhost Auth to enforce the mode on sensitive endpoints and Hasura permissions to enforce the claim on sensitive GraphQL operations, including direct security-key deletion. Email verification and Google sign-in establish ordinary sessions. [Nhost elevated permissions guide](https://docs.nhost.io/products/auth/elevated-permissions)

#### API

**Parameters:**
- `fn`: A string specifying which authentication method to call that requires elevated permissions (e.g., `"changeUserPassword"`, `"changeUserEmail"`, etc.)
- `onSuccess`: Optional callback function that runs when the operation succeeds. Receives:
  - `nhost`: The Nhost client instance
  - `data`: The response data from the authentication method
  - `params`: The parameters that were passed to the method
- `onError`: Optional callback function that runs when the operation fails. Receives:
  - `nhost`: The Nhost client instance
  - `error`: The error object with details about what went wrong
  - `params`: The parameters that were passed to the method

**Returns:**
- `callAsync`: Function to call the authentication method with the required parameters (automatically handles elevation if needed)
- `isLoading`: Boolean indicating if the operation is in progress
- `isSuccess`: Boolean indicating if the last operation succeeded
- `error`: Error object (or `null`) containing details if the operation failed

#### Example

```tsx
import { useNhostAuthElevated } from "react-nhost"
import { useState } from "react"

export function ChangePasswordComponent() {
  const [newPassword, setNewPassword] = useState("")
  
  const { callAsync, isLoading, isSuccess, error } = useNhostAuthElevated({
    fn: "changeUserPassword",
    onSuccess: ({ nhost, data, params }) => {
      console.log("Password changed successfully:", data)
      // Password was changed
      setNewPassword("")
    },
    onError: ({ nhost, error, params }) => {
      console.error("Password change failed:", error.message)
      // Access nhost client if needed
      // params contains the password that was attempted
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await callAsync({
      newPassword
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="New Password"
        disabled={isLoading}
      />
      <button type="submit" disabled={isLoading || !newPassword}>
        {isLoading ? "Changing password..." : "Change Password"}
      </button>
      {error && <div className="error">{error.message}</div>}
      {isSuccess && <div className="success">Password changed successfully!</div>}
    </form>
  )
}
```

### 📦 `useNhostStorage`

This hook creates a type-safe wrapper for any function callable inside the `nhost.storage` directive. It provides loading states, error handling, and success callbacks for storage operations.

For the complete API reference, see the **[Nhost SDK Storage Documentation](https://docs.nhost.io/reference/javascript/nhost-js/storage)**.

#### API

**Parameters:**
- `fn`: A string specifying which storage method to call (e.g., `"uploadFiles"`, `"deleteFile"`, `"getFilePresignedURL"`, `"listBrokenMetadata"`, etc.)
- `onSuccess`: Optional callback function that runs when the operation succeeds. Receives:
  - `nhost`: The Nhost client instance
  - `data`: The response data from the storage method
  - `params`: The parameters that were passed to the method
- `onError`: Optional callback function that runs when the operation fails. Receives:
  - `nhost`: The Nhost client instance
  - `error`: The error object with details about what went wrong
  - `params`: The parameters that were passed to the method

**Returns:**
- `callAsync`: Function to call the storage method with the required parameters
- `isLoading`: Boolean indicating if the operation is in progress
- `isSuccess`: Boolean indicating if the last operation succeeded
- `error`: Error object (or `null`) containing details if the operation failed

#### Example

```tsx
import { useNhostStorage } from "react-nhost"

export function FileUploadComponent() {
  const { callAsync, isLoading } = useNhostStorage({
    fn: "uploadFiles",
    onSuccess: ({ nhost, data, params }) => {
      console.log("Files uploaded:", data)
    },
    onError: ({ nhost, error, params }) => {
      console.error("Upload failed:", error.message)
    }
  })

  const handleUpload = async (files: File[]) => {
    await callAsync({
      "files[]": files
    })
  }

  return (
    <button onClick={() => handleUpload([])} disabled={isLoading}>
      Upload Files
    </button>
  )
}
```

### 🛡️ `useNhostSecurity`

This hook provides functionality for managing WebAuthn security keys and elevated permissions. It automatically fetches security keys for the current user and provides methods to check and elevate permissions.

#### API

**Parameters:**
This hook takes no parameters.

**Returns:**
- `hasSecurityKeys`: Boolean indicating if the user has any security keys registered
- `securityKeys`: Array of security keys with `id` and `nickname` properties
- `isElevated`: Boolean indicating if the user currently has elevated permissions
- `isLoading`: Boolean indicating if security keys are being fetched
- `requiresElevation`: Boolean indicating whether the configured mode requires a step-up for the current user
- `checkElevation`: Function to prompt the user to authenticate with their security key to elevate permissions
- `refreshSecurityKeys`: Function to manually refresh the list of security keys

#### Example

```tsx
import { useNhostSecurity } from "react-nhost"

export function SecurityKeysComponent() {
  const {
    hasSecurityKeys,
    securityKeys,
    isElevated,
    isLoading,
    requiresElevation,
    checkElevation,
    refreshSecurityKeys
  } = useNhostSecurity()

  if (isLoading) {
    return <div>Loading security information...</div>
  }

  return (
    <div>
      <h2>Security Keys</h2>
      
      {hasSecurityKeys ? (
        <div>
          <p>You have {securityKeys.length} security key(s) registered:</p>
          <ul>
            {securityKeys.map((key) => (
              <li key={key.id}>
                {key.nickname} (ID: {key.id})
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>No security keys registered</p>
      )}

      <div>
        <p>Elevation Status: {isElevated ? "✅ Elevated" : "❌ Not Elevated"}</p>
        
        {requiresElevation && (
          <div>
            <p>⚠️ Elevation required for this operation</p>
            <button onClick={checkElevation}>
              Elevate Permissions
            </button>
          </div>
        )}
      </div>

      <button onClick={refreshSecurityKeys}>
        Refresh Security Keys
      </button>
    </div>
  )
}
```

For auth, elevated auth, and storage, `callAsync` resolves with the SDK result or an error.
Use `result instanceof Error` to distinguish failures. Callbacks receive the first SDK argument as
`params`. A browser or callback failure can be a regular `Error`. With overlapping calls,
`isLoading` stays true until all calls settle, and the most recently started call owns
`isSuccess` and `error`. Each invocation still runs its own callbacks.

## Type Safety

All hooks are fully type-safe and provide TypeScript autocomplete for:

- Available functions in `useNhostAuth`, `useNhostAuthElevated`, and `useNhostStorage`
- Function parameters based on the selected function
- Return types based on the selected function
- Error types from the Nhost SDK

This ensures that you catch errors at compile time rather than runtime.

## Support

Enjoying `react-nhost`? If this library has made your life easier (or at least your React apps more awesome), consider buying me a coffee! ☕

Your support helps keep this project maintained, updated, and caffeinated! 🙏

**[☕ Buy me a coffee](https://buymeacoffee.com/dohomi)**
