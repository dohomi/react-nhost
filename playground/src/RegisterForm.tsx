import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef, useState, type FormEvent } from "react";
import { preparePKCE, useNhost, useNhostAuth } from "../../src";

const turnstileSiteKey: string | undefined = import.meta.env["VITE_TURNSTILE_SITE_KEY"];

export function RegisterForm() {
  const widget = useRef<TurnstileInstance>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const { nhost } = useNhost();
  const signIn = useNhostAuth({ fn: "signInEmailPassword" });
  const signUp = useNhostAuth({ fn: "signUpEmailPassword" });
  const verifyMfa = useNhostAuth({ fn: "verifySignInMfaTotp" });
  const [register, setRegister] = useState(false);
  const [ticket, setTicket] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const redirectTo = new URL("/verify", window.location.origin).href;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "");
    const password = String(fields.get("password") ?? "");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (ticket) {
        const result = await verifyMfa.callAsync({ ticket, otp: String(fields.get("otp")) });
        if (result instanceof Error) throw result;
      } else if (register) {
        const attempt = await preparePKCE(nhost);
        const signup = { email, password, codeChallenge: attempt.codeChallenge, options: { redirectTo } };
        const result = turnstileSiteKey
          ? await signUp.callAsync(signup, { headers: { "x-cf-turnstile-response": turnstileToken } })
          : await signUp.callAsync(signup);
        if (result instanceof Error || result.body.session) attempt.clear();
        if (result instanceof Error) throw result;
        if (!result.body.session) setMessage(`Check ${email} for a verification link. Open it in this browser.`);
      } else {
        const result = await signIn.callAsync({ email, password });
        if (result instanceof Error) throw result;
        if (result.body.mfa) setTicket(result.body.mfa.ticket);
        else if (!result.body.session) throw new Error("Sign-in did not return a session.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (register && turnstileSiteKey) {
        setTurnstileToken("");
        widget.current?.reset();
      }
      setBusy(false);
    }
  }

  async function oauth(provider: "apple" | "google") {
    setBusy(true);
    setError("");
    try {
      const { codeChallenge } = await preparePKCE(nhost);
      window.location.assign(nhost.auth.signInProviderURL(provider, { redirectTo, codeChallenge }));
    } catch (cause) {
      setError(String(cause));
      setBusy(false);
    }
  }

  const title = ticket ? "Verify authenticator code" : register ? "Create account" : "Sign in";
  return <>
    <h1>{title}</h1>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        {ticket ? <label>Authenticator code <input name="otp" autoComplete="one-time-code" required /></label> : <>
          <label>Email <input name="email" type="email" autoComplete="email" required /></label>
          <label>Password <input name="password" type="password" minLength={register ? 8 : undefined} autoComplete={register ? "new-password" : "current-password"} required /></label>
        </>}
        {register && turnstileSiteKey && <Turnstile ref={widget} siteKey={turnstileSiteKey}
          onSuccess={setTurnstileToken} onExpire={() => setTurnstileToken("")}
          onError={() => { setTurnstileToken(""); setError("The browser challenge failed. Check that this hostname is allowed for your Turnstile site key."); }} />}
        <button type="submit" disabled={!!(register && turnstileSiteKey && !turnstileToken)}>{title}</button>
      </fieldset>
    </form>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={() => { setRegister(!register && !ticket); setTurnstileToken(""); setTicket(""); setError(""); setMessage(""); }}>
      {register || ticket ? "Back to sign in" : "Register with email"}
    </button>
    <p>
      <button disabled={busy} onClick={() => void oauth("google")}>Continue with Google</button>{" "}
      <button disabled={busy} onClick={() => void oauth("apple")}>Continue with Apple</button>
    </p>
  </>;
}
