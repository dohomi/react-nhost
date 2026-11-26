import { createClient } from "@nhost/nhost-js";
import { useState } from "react";
import { NhostProvider, useNhost } from "../../src";
import { RegisterForm } from "./RegisterForm";

const client = createClient({
  authUrl: import.meta.env["VITE_NHOST_AUTH_URL"],
  subdomain: import.meta.env["VITE_NHOST_SUBDOMAIN"] || "local",
  region: import.meta.env["VITE_NHOST_REGION"],
});

function Account() {
  const { user, isAuthenticated, isLoading, callbackError, signOut } = useNhost();
  const [error, setError] = useState("");
  if (isLoading) return <p role="status">Checking session…</p>;
  if (isAuthenticated) return <main>
    <h1>Your account</h1>
    <p>Signed in as {user?.email || user?.displayName}.</p>
    <button onClick={() => { void signOut().catch(e => setError(String(e))); }}>Sign out</button>
    {error && <p role="alert">{error}</p>}
  </main>;
  return <main>
    {callbackError && <p role="alert">{callbackError.message}</p>}
    <RegisterForm />
  </main>;
}

export function App() {
  return <NhostProvider nhostClient={client} pkceCallbackPath="/verify"><Account /></NhostProvider>;
}
