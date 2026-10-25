#!/usr/bin/env node
/**
 * Shows which return addresses Supabase Auth will actually use. Supabase
 * silently replaces any redirectTo / emailRedirectTo that isn't on
 * Authentication → URL Configuration → Redirect URLs with the Site URL, so a
 * password-reset link can quietly land on your home page instead of the reset
 * screen.
 *
 * For each URL it asks Supabase to generate a sign-in link (admin API) and
 * reads back the return address it chose. It sends no email. Use the email of
 * an existing test user; the generated link is never used and expires.
 *
 *   SUPABASE_URL=https://abcdefghijklmnop.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
 *   TEST_EMAIL=test@example.com \
 *   node scripts/check-redirects.mjs https://app.example.com/ myapp://auth/reset-password
 */
const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.TEST_EMAIL
const targets = process.argv.slice(2)
if (!url || !key || !email || !targets.length) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TEST_EMAIL=<existing user> node scripts/check-redirects.mjs <url> [url...]')
  process.exit(1)
}

let failures = 0
for (const target of targets) {
  const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email, redirect_to: target }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.log(`ERROR    ${target}  (${res.status} ${body.msg || body.message || body.error || ''})`)
    failures++
    continue
  }
  const used = body.redirect_to ?? body.properties?.redirect_to
  if (used === target) {
    console.log(`allowed  ${target}`)
  } else {
    console.log(`REPLACED ${target}  → Supabase would use ${used} (add it to Redirect URLs)`)
    failures++
  }
}
process.exit(failures ? 2 : 0)
