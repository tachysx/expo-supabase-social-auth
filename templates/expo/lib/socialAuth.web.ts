/**
 * Web build (react-native-web): Apple and Google through Supabase's OAuth
 * redirect. The page leaves for the provider and comes back with the session.
 * Same exports as socialAuth.ts, so screens need no Platform checks.
 *
 * Before this works:
 * - Supabase → Authentication → URL Configuration → Redirect URLs must contain
 *   this site's origin (e.g. https://app.example.com/**). Any redirectTo that
 *   isn't listed is silently replaced with the Site URL.
 * - Apple on the web needs a Services ID listed FIRST in Supabase's Apple
 *   "Client IDs", plus a client secret that expires every 6 months
 *   (scripts/apple-web-secret.mjs). Native iOS doesn't use either.
 * - The session comes back in the URL: either let supabase-js read it
 *   (detectSessionInUrl: true on web) or parse the #access_token fragment
 *   yourself and call supabase.auth.setSession (docs/08).
 */
// Adjust to wherever your app creates its Supabase client.
import { supabase } from './supabase'

export type SocialSignInResult =
  | { status: 'signed-in' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string }

export const appleSignInAvailable = true
export const googleSignInAvailable = true

async function redirectTo(provider: 'apple' | 'google'): Promise<SocialSignInResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  })
  if (error) return { status: 'failed', message: error.message }
  // The browser is on its way to the provider; nothing else happens on this page.
  return new Promise(() => {})
}

export const signInWithGoogle = () => redirectTo('google')
export const signInWithApple = () => redirectTo('apple')

/** Only the iOS app can ask Apple to confirm again; on the web the account is deleted without revoking. */
export async function appleAuthorizationCode(): Promise<string | null> {
  return null
}

export async function signOutSocial(): Promise<void> {}
