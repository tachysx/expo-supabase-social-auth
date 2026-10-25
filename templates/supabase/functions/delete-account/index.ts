/**
 * DELETE /functions/v1/delete-account — permanently deletes the signed-in
 * person's account. App Store and Google Play both require in-app deletion.
 *
 * Body (optional): { "appleAuthorizationCode": "..." }, sent by the iOS app
 * after asking Apple to confirm (socialAuth.appleAuthorizationCode). With it,
 * the Apple token is revoked, as App Review guideline 5.1.1(v) requires.
 *
 * Secrets (supabase secrets set ...): APPLE_TEAM_ID, APPLE_BUNDLE_ID,
 * APPLE_SIWA_KEY_ID, APPLE_SIWA_PRIVATE_KEY (the .p8 contents). Without them
 * the account is still deleted and the log says the token wasn't revoked.
 *
 * Deploy with verify_jwt = false (config.toml): this function checks the
 * bearer token itself, which also works with Supabase's newer signing keys.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { revokeAppleSignIn } from '../_shared/apple-signin.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/** Never blocks the deletion: a failure is logged and returned in `details`. */
async function revokeApple(code: unknown): Promise<string> {
  if (typeof code !== 'string' || !code) return 'not-requested'
  const teamId = Deno.env.get('APPLE_TEAM_ID')
  const clientId = Deno.env.get('APPLE_BUNDLE_ID')
  const keyId = Deno.env.get('APPLE_SIWA_KEY_ID')
  const privateKey = Deno.env.get('APPLE_SIWA_PRIVATE_KEY')
  if (!teamId || !clientId || !keyId || !privateKey) {
    console.error('[delete-account] Apple token not revoked: APPLE_* secrets not set')
    return 'not-configured'
  }
  try {
    await revokeAppleSignIn(code, { teamId, clientId, keyId, privateKey })
    return 'revoked'
  } catch (err) {
    console.error('[delete-account] Apple token not revoked:', err)
    return 'error'
  }
}

/**
 * >>> FILL IN: delete this person's rows from your own tables. <<<
 * Return a short status per table. Tables whose foreign key to auth.users is
 * ON DELETE CASCADE go with the login anyway; delete the rest here, and keep
 * anything the law makes you keep (e.g. purchase records for tax) unlinked.
 * Must cope with a person who has no rows yet (signed in, never finished
 * onboarding): a social sign-in creates the login before your profile exists.
 */
async function deleteAppData(_admin: SupabaseClient, _authUserId: string): Promise<Record<string, string>> {
  // Example:
  // const { error } = await _admin.from('profiles').delete().eq('auth_user_id', _authUserId)
  // if (error) throw new Error(`profiles: ${error.message}`)
  // return { profiles: 'deleted' }
  return {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } }
  const user = auth.user
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  const details: Record<string, string> = {}
  details.apple_token = await revokeApple(body?.appleAuthorizationCode)

  try {
    Object.assign(details, await deleteAppData(admin, user.id))
  } catch (err) {
    // Stop while the login still exists, so the person can retry.
    console.error('[delete-account] App data not deleted:', err)
    return json({ error: 'Could not delete your data. Please try again.', details }, 500)
  }

  const { error } = await admin.auth.admin.deleteUser(user.id)
  details.auth_user = error ? 'error' : 'deleted'
  if (error) {
    console.error('[delete-account] Login not deleted:', error)
    return json({ error: 'Could not delete your account. Please try again.', details }, 500)
  }

  console.log('[delete-account] Deleted', { authUserId: user.id, details })
  return json({ success: true, details })
})
