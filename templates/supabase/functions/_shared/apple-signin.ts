/**
 * Sign in with Apple: revoke the app's Apple token when someone deletes their
 * account. App Review requires it (guideline 5.1.1(v)) for apps that offer
 * Sign in with Apple.
 *
 * Flow: the app asks Apple for a fresh authorization code (the person confirms
 * once more), the server exchanges it at /auth/token for a refresh token, and
 * revokes that at /auth/revoke. Both calls authenticate with a client secret:
 * an ES256 JWT signed with your Sign in with Apple key (.p8).
 *
 * Plain Web Crypto + fetch, so it runs in Supabase Edge Functions (Deno), and
 * in Node 20+ unchanged.
 */

export interface AppleClientConfig {
  /** Apple Developer team ID (10 characters, top right of developer.apple.com/account). */
  teamId: string
  /** The client the code was issued to: your iOS bundle ID for codes from the app, the Services ID for web. */
  clientId: string
  /** The Sign in with Apple key's ID (in the .p8 file name: AuthKey_<KEYID>.p8). */
  keyId: string
  /** The .p8 file's contents (PEM). Newlines may be stripped; the header lines are ignored. */
  privateKey: string
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlJson = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)))

/** The client_secret Apple's REST API takes: an ES256 JWT signed with the key, valid 5 minutes. */
export async function appleClientSecret(
  { teamId, clientId, keyId, privateKey }: AppleClientConfig,
  now = Math.floor(Date.now() / 1000)
): Promise<string> {
  const der = Uint8Array.from(atob(privateKey.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')), (c) =>
    c.charCodeAt(0)
  )
  const signingKey = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const unsigned = `${b64urlJson({ alg: 'ES256', kid: keyId })}.${b64urlJson({
    iss: teamId,
    iat: now,
    exp: now + 300,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  })}`
  // Web Crypto returns the raw r||s signature, which is exactly what ES256 JWTs use (not DER).
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, new TextEncoder().encode(unsigned))
  return `${unsigned}.${b64url(new Uint8Array(signature))}`
}

async function postForm(url: string, form: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

/**
 * Exchanges the authorization code and revokes the refresh token. Throws with
 * Apple's answer if either step fails. Apple checks the code before the client
 * secret: `invalid_grant` = the code is used, older than 5 minutes or issued to
 * another client ID; `invalid_client` = Apple rejected the key, key ID, team ID
 * or client ID. (So a made-up code can't be used to test a key.)
 */
export async function revokeAppleSignIn(authorizationCode: string, config: AppleClientConfig): Promise<void> {
  const clientSecret = await appleClientSecret(config)
  const token = await postForm('https://appleid.apple.com/auth/token', {
    client_id: config.clientId,
    client_secret: clientSecret,
    code: authorizationCode,
    grant_type: 'authorization_code',
  })
  if (!token.ok || !token.body.refresh_token) {
    throw new Error(`Apple token exchange failed: ${token.status} ${token.body.error ?? ''}`.trim())
  }
  const revoke = await postForm('https://appleid.apple.com/auth/revoke', {
    client_id: config.clientId,
    client_secret: clientSecret,
    token: token.body.refresh_token,
    token_type_hint: 'refresh_token',
  })
  if (!revoke.ok) throw new Error(`Apple revoke failed: ${revoke.status} ${revoke.body.error ?? ''}`.trim())
}
