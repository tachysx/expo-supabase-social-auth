#!/usr/bin/env node
/**
 * Turns on Google and/or Apple sign-in for a hosted Supabase project and adds
 * your app's return addresses, through the Management API. Dry run by default:
 * prints what it would send (secrets masked). Add --apply to send it.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abcdefghijklmnop \
 *   GOOGLE_WEB_CLIENT_ID=... GOOGLE_WEB_CLIENT_SECRET=... \
 *   GOOGLE_ANDROID_CLIENT_IDS=id1,id2 GOOGLE_IOS_CLIENT_ID=... \
 *   APPLE_BUNDLE_ID=com.example.app APPLE_SERVICES_ID=com.example.app.web \
 *   REDIRECT_URLS='https://app.example.com/**,myapp://**' \
 *   node scripts/configure-supabase-auth.mjs [--apply]
 *
 * Only providers whose variables are set are touched. Order matters and is
 * handled here:
 * - Google "Client IDs": the web client first (Supabase uses it for the web
 *   redirect), then the Android and iOS clients (accepted for native tokens).
 * - Apple "Client IDs": the Services ID first (web redirect), then the bundle
 *   ID (native iOS). The Apple web secret is set by apple-web-secret.mjs.
 * - "Skip nonce check" for Google is on: the iOS Google SDK adds its own nonce.
 */

const apply = process.argv.includes('--apply')
const env = (name) => process.env[name]?.trim() || undefined
const list = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [])
const mask = (value) => (value ? `${value.slice(0, 4)}… (${value.length} chars)` : value)

const token = env('SUPABASE_ACCESS_TOKEN')
const ref = env('SUPABASE_PROJECT_REF')
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens) and SUPABASE_PROJECT_REF.')
  process.exit(1)
}
const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

const patch = {}

const googleWeb = env('GOOGLE_WEB_CLIENT_ID')
if (googleWeb) {
  const secret = env('GOOGLE_WEB_CLIENT_SECRET')
  if (!secret) {
    console.error('GOOGLE_WEB_CLIENT_SECRET is required with GOOGLE_WEB_CLIENT_ID (the web client\'s secret).')
    process.exit(1)
  }
  const ids = [googleWeb, ...list(env('GOOGLE_ANDROID_CLIENT_IDS')), ...list(env('GOOGLE_IOS_CLIENT_ID'))]
  Object.assign(patch, {
    external_google_enabled: true,
    external_google_client_id: [...new Set(ids)].join(','),
    external_google_secret: secret,
    external_google_skip_nonce_check: true,
  })
}

const appleIds = [env('APPLE_SERVICES_ID'), env('APPLE_BUNDLE_ID')].filter(Boolean)
if (appleIds.length) {
  Object.assign(patch, { external_apple_enabled: true, external_apple_client_id: appleIds.join(',') })
}

const redirects = list(env('REDIRECT_URLS'))
let current = null
if (redirects.length || apply) {
  const res = await fetch(api, { headers })
  if (!res.ok) {
    console.error(`Could not read the current auth config: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  current = await res.json()
}
if (redirects.length) {
  const existing = list(current.uri_allow_list)
  const added = redirects.filter((url) => !existing.includes(url))
  if (added.length) patch.uri_allow_list = [...existing, ...added].join(',')
  console.log(`Site URL (where Supabase sends any return address NOT on the list): ${current.site_url}`)
  console.log(`Redirect URLs to add: ${added.length ? added.join(', ') : '(all already listed)'}`)
}

if (!Object.keys(patch).length) {
  console.log('Nothing to change. Set the GOOGLE_*, APPLE_* or REDIRECT_URLS variables (see the comment at the top).')
  process.exit(0)
}

const shown = { ...patch, ...(patch.external_google_secret ? { external_google_secret: mask(patch.external_google_secret) } : {}) }
console.log(`${apply ? 'Sending' : 'Dry run. Would send'} PATCH ${api}`)
console.log(JSON.stringify(shown, null, 2))
if (!apply) {
  console.log('\nRun again with --apply to change the project.')
  process.exit(0)
}

const res = await fetch(api, { method: 'PATCH', headers, body: JSON.stringify(patch) })
if (!res.ok) {
  console.error(`Supabase ${res.status}: ${await res.text()}`)
  process.exit(1)
}
const config = await res.json()
console.log('\nNow set:')
if (googleWeb) console.log(`  Google: enabled=${config.external_google_enabled}, client IDs=${config.external_google_client_id}, skip nonce=${config.external_google_skip_nonce_check}`)
if (appleIds.length) console.log(`  Apple: enabled=${config.external_apple_enabled}, client IDs=${config.external_apple_client_id}`)
if (patch.uri_allow_list) console.log(`  Redirect URLs: ${config.uri_allow_list}`)
