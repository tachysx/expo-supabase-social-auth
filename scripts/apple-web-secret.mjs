#!/usr/bin/env node
/**
 * Sign in with Apple on the WEB needs a client secret in Supabase: an ES256 JWT
 * signed with your Sign in with Apple key, with your Services ID as subject.
 * Apple caps it at 6 months, so this makes a new one and stores it. Put the
 * expiry date it prints in your calendar and run it again before then.
 * The native iOS app doesn't use this secret.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abcdefghijklmnop \
 *   APPLE_TEAM_ID=ABCDE12345 APPLE_SERVICES_ID=com.example.app.web APPLE_BUNDLE_ID=com.example.app \
 *   APPLE_KEY_PATH=~/secrets/AuthKey_KEYID12345.p8 \
 *   node scripts/apple-web-secret.mjs [--dry-run]
 *
 * --dry-run prints the JWT header and claims (never the token) and changes nothing.
 * It also sets Supabase's Apple "Client IDs" to "<Services ID>,<bundle ID>":
 * the Services ID must come first, because Supabase uses the first one for the
 * web redirect. A bundle ID first keeps native working but breaks the web.
 */
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { homedir } from 'node:os'

const VALID_DAYS = 180 // Apple's maximum is 6 months

const dryRun = process.argv.includes('--dry-run')
const env = (name) => process.env[name]?.trim() || undefined
const teamId = env('APPLE_TEAM_ID')
const servicesId = env('APPLE_SERVICES_ID')
const bundleId = env('APPLE_BUNDLE_ID')
const keyPath = env('APPLE_KEY_PATH')?.replace(/^~(?=\/)/, homedir())
const keyId = keyPath && basename(keyPath).match(/^AuthKey_([A-Z0-9]+)\.p8$/)?.[1]

if (!teamId || !servicesId || !keyPath) {
  console.error('Set APPLE_TEAM_ID, APPLE_SERVICES_ID and APPLE_KEY_PATH (and APPLE_BUNDLE_ID to keep native iOS listed).')
  process.exit(1)
}
if (!keyId) {
  console.error('APPLE_KEY_PATH must point to the file Apple gave you, named AuthKey_<KEYID>.p8 (the key ID is read from the name).')
  process.exit(1)
}

const now = Math.floor(Date.now() / 1000)
const exp = now + VALID_DAYS * 86400
const header = { alg: 'ES256', kid: keyId }
const claims = { iss: teamId, iat: now, exp, aud: 'https://appleid.apple.com', sub: servicesId }
const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const unsigned = `${part(header)}.${part(claims)}`
const signature = sign('sha256', Buffer.from(unsigned), {
  key: createPrivateKey(readFileSync(keyPath)),
  dsaEncoding: 'ieee-p1363', // JWTs use the raw r||s signature, not DER
}).toString('base64url')
const secret = `${unsigned}.${signature}`
const expires = new Date(exp * 1000).toISOString().slice(0, 10)
const clientIds = [servicesId, bundleId].filter(Boolean).join(',')

if (dryRun) {
  console.log('Dry run. Signed a secret with:')
  console.log('  header:', JSON.stringify(header))
  console.log('  claims:', JSON.stringify(claims))
  console.log(`  would set Apple client IDs to "${clientIds}"; secret would expire ${expires}`)
  process.exit(0)
}

const token = env('SUPABASE_ACCESS_TOKEN')
const ref = env('SUPABASE_PROJECT_REF')
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (or use --dry-run).')
  process.exit(1)
}
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ external_apple_enabled: true, external_apple_client_id: clientIds, external_apple_secret: secret }),
})
if (!res.ok) {
  console.error(`Supabase ${res.status}: ${await res.text()}`)
  process.exit(1)
}
const config = await res.json()
console.log(`Apple client IDs: ${config.external_apple_client_id}`)
console.log(`Web secret set. It expires ${expires}: run this again before then, or web sign-in with Apple stops working.`)
