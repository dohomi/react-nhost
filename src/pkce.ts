import type { NhostClient } from "@nhost/nhost-js";
import { generatePKCEPair } from "@nhost/nhost-js/auth";

function verifierKey(nhost: NhostClient) {
  return `react-nhost:pkce:${nhost.auth.baseURL}`;
}

/** Start a browser redirect flow. Only the challenge goes in the outbound request. */
export async function preparePKCE(nhost: NhostClient) {
  const { verifier, challenge } = await generatePKCEPair();
  const key = verifierKey(nhost);
  localStorage.setItem(key, verifier);
  return {
    codeChallenge: challenge,
    clear() {
      if (localStorage.getItem(key) === verifier) localStorage.removeItem(key);
    },
  };
}

export async function exchangePKCE(nhost: NhostClient, code: string) {
  const key = verifierKey(nhost);
  const codeVerifier = localStorage.getItem(key);
  if (!codeVerifier) {
    throw new Error("No verification request was found in this browser. Sign in or start again in the browser where you requested the link.");
  }
  localStorage.removeItem(key);
  const { body } = await nhost.auth.tokenExchange({ code, codeVerifier });
  if (!body.session) throw new Error("Verification did not return a session.");
}
