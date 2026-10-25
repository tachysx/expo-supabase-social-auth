// Run: deno test supabase/functions/_shared/apple-signin.test.ts
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { appleClientSecret, revokeAppleSignIn, type AppleClientConfig } from './apple-signin.ts'

// A throwaway P-256 key in the .p8 (PKCS#8 PEM) format Apple hands out.
async function testKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey }
}

const config = (privateKey: string): AppleClientConfig => ({
  teamId: 'ABCDE12345',
  clientId: 'com.example.app',
  keyId: 'KEYID12345',
  privateKey,
})

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const decode = (s: string) => JSON.parse(new TextDecoder().decode(fromB64url(s)))

Deno.test('client secret is an ES256 JWT Apple accepts, with a signature that verifies', async () => {
  const { pem, publicKey } = await testKey()
  const jwt = await appleClientSecret(config(pem), 1_800_000_000)
  const [header, payload, signature] = jwt.split('.')

  assertEquals(decode(header), { alg: 'ES256', kid: 'KEYID12345' })
  assertEquals(decode(payload), {
    iss: 'ABCDE12345',
    iat: 1_800_000_000,
    exp: 1_800_000_300,
    aud: 'https://appleid.apple.com',
    sub: 'com.example.app',
  })
  assertEquals(fromB64url(signature).length, 64) // raw r||s, not DER
  assert(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromB64url(signature),
      new TextEncoder().encode(`${header}.${payload}`)
    )
  )
})

Deno.test('a key with its newlines stripped (as stored in a secret) still works', async () => {
  const { pem, publicKey } = await testKey()
  const jwt = await appleClientSecret(config(pem.replace(/\n/g, '')))
  const [header, payload, signature] = jwt.split('.')
  assert(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromB64url(signature),
      new TextEncoder().encode(`${header}.${payload}`)
    )
  )
})

function stubFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; form: URLSearchParams }> = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, form: new URLSearchParams(String(init.body)) })
    const next = responses.shift()!
    return new Response(JSON.stringify(next.body), { status: next.status })
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

Deno.test('exchanges the code, then revokes the refresh token it got', async () => {
  const { pem } = await testKey()
  const stub = stubFetch([
    { status: 200, body: { refresh_token: 'r-token', access_token: 'a-token' } },
    { status: 200, body: {} },
  ])
  try {
    await revokeAppleSignIn('auth-code', config(pem))
  } finally {
    stub.restore()
  }
  assertEquals(stub.calls.map((c) => c.url), ['https://appleid.apple.com/auth/token', 'https://appleid.apple.com/auth/revoke'])
  assertEquals(stub.calls[0].form.get('code'), 'auth-code')
  assertEquals(stub.calls[0].form.get('grant_type'), 'authorization_code')
  assertEquals(stub.calls[0].form.get('client_id'), 'com.example.app')
  assertEquals(stub.calls[1].form.get('token'), 'r-token')
  assertEquals(stub.calls[1].form.get('token_type_hint'), 'refresh_token')
  assert(stub.calls[1].form.get('client_secret')?.split('.').length === 3)
})

Deno.test('a rejected code throws and never calls revoke', async () => {
  const { pem } = await testKey()
  const stub = stubFetch([{ status: 400, body: { error: 'invalid_grant' } }])
  try {
    await assertRejects(() => revokeAppleSignIn('used-code', config(pem)), Error, 'invalid_grant')
  } finally {
    stub.restore()
  }
  assertEquals(stub.calls.length, 1)
})
