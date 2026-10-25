#!/usr/bin/env node
/**
 * Checks your Sign in with Apple key setup.
 *
 *   APPLE_TEAM_ID=ABCDE12345 APPLE_KEY_PATH=~/secrets/AuthKey_KEYID12345.p8 \
 *   node scripts/check-apple-key.mjs com.example.app [--code <authorization code>]
 *
 * Without --code it checks what can be checked offline: the .p8 is a P-256
 * private key, the key ID (from the file name) and team ID look right, and a
 * client secret can be signed.
 *
 * Apple can NOT confirm a key with a made-up code: its token endpoint answers
 * "invalid_grant" (and /auth/revoke answers 200) even for a garbage client
 * secret, because it rejects the code before it looks at the secret (tested
 * Oct 2026). So "invalid_grant on a dummy code" proves nothing.
 *
 * The real proofs:
 * - --code with a fresh authorization code (Apple's codes are single use and
 *   expire after 5 minutes). Get one from a dev build: log
 *   credential.authorizationCode from AppleAuthentication.signInAsync, or call
 *   socialAuth.appleAuthorizationCode(). The script exchanges it and revokes
 *   the token: a full end-to-end test of what account deletion does.
 * - Web: a real "Continue with Apple" on your web app (Supabase exchanges a
 *   real code with your web secret).
 * - iOS deletion: your delete function's log shows apple_token: revoked.
 */
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const codeIndex = args.indexOf('--code')
const code = codeIndex >= 0 ? args[codeIndex + 1] : undefined
const clientId = args.find((a, i) => !a.startsWith('--') && (codeIndex < 0 || i !== codeIndex + 1)) || process.env.APPLE_BUNDLE_ID
const teamId = process.env.APPLE_TEAM_ID?.trim()
const keyPath = process.env.APPLE_KEY_PATH?.trim().replace(/^~(?=\/)/, homedir())
if (!clientId || !teamId || !keyPath) {
  console.error('Usage: APPLE_TEAM_ID=... APPLE_KEY_PATH=.../AuthKey_<KEYID>.p8 node scripts/check-apple-key.mjs <bundle ID or Services ID> [--code <authorization code>]')
  process.exit(1)
}

let problems = 0
const check = (ok, good, bad) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${ok ? good : bad}`)
  if (!ok) problems++
}

const keyId = basename(keyPath).match(/^AuthKey_([A-Z0-9]{10})\.p8$/)?.[1]
check(!!keyId, `key ID ${keyId} (from the file name)`, 'file name should be AuthKey_<10-character key ID>.p8, as Apple named it')
check(/^[A-Z0-9]{10}$/.test(teamId), `team ID ${teamId}`, `team ID "${teamId}" should be 10 letters/digits (developer.apple.com/account, top right)`)
check(/^[A-Za-z0-9.-]+$/.test(clientId) && clientId.includes('.'), `client ID ${clientId}`, `client ID "${clientId}" should be your bundle ID or Services ID`)

let key
try {
  key = createPrivateKey(readFileSync(keyPath))
  const curve = key.asymmetricKeyDetails?.namedCurve
  check(key.asymmetricKeyType === 'ec' && curve === 'prime256v1', 'the .p8 is a P-256 private key', `the .p8 is not a P-256 EC key (${key.asymmetricKeyType} ${curve ?? ''})`)
} catch (e) {
  check(false, '', `could not read the .p8: ${e.message}`)
}
if (problems || !keyId) process.exit(2)

const now = Math.floor(Date.now() / 1000)
const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const unsigned = `${part({ alg: 'ES256', kid: keyId })}.${part({ iss: teamId, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: clientId })}`
const secret = `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
check(true, 'signed a client secret (ES256)', '')

if (!code) {
  console.log('\nOffline checks passed. Apple only confirms the key with a real authorization code: rerun with --code <code> (see the comment at the top).')
  process.exit(0)
}

const post = async (url, form) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const token = await post('https://appleid.apple.com/auth/token', {
  client_id: clientId,
  client_secret: secret,
  code,
  grant_type: 'authorization_code',
})
if (!token.body.refresh_token) {
  console.log(`FAIL Apple refused the exchange: ${token.status} ${JSON.stringify(token.body)}`)
  console.log('     invalid_grant: the code is used, older than 5 minutes, or was issued to a different client ID.')
  console.log('     invalid_client: Apple rejected the key, key ID, team ID or client ID.')
  process.exit(2)
}
check(true, 'Apple exchanged the code with your client secret: the key, team and client ID are right', '')
const revoke = await post('https://appleid.apple.com/auth/revoke', {
  client_id: clientId,
  client_secret: secret,
  token: token.body.refresh_token,
  token_type_hint: 'refresh_token',
})
check(revoke.status === 200, 'revoked the token again (what account deletion does)', `revoke answered ${revoke.status} ${JSON.stringify(revoke.body)}`)
process.exit(problems ? 2 : 0)
