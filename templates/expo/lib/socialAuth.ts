/**
 * Sign in with Apple (iOS) and Google (iOS, Android) through each platform's
 * native sheet. The ID token they return signs in to Supabase with
 * `signInWithIdToken`. The web build uses Supabase's redirect instead
 * (socialAuth.web.ts); Metro picks the right file per platform, so the native
 * Google module never lands in the web bundle.
 *
 * A first sign-in creates the account. These users never see your email
 * sign-up form, so ask for consent in onboarding (docs/06).
 *
 * Needs: expo-apple-authentication, expo-crypto,
 * @react-native-google-signin/google-signin, and a dev/store build (not Expo Go
 * for Google).
 */
import { Platform } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin'
// Adjust to wherever your app creates its Supabase client.
import { supabase } from './supabase'

// OAuth client IDs from Google Cloud. They're public (they ship in the app), not secrets.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID

export type SocialSignInResult =
  | { status: 'signed-in' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string }

/** Apple only on iOS here: Android has no Apple sheet (the web build offers Apple through the redirect). */
export const appleSignInAvailable = Platform.OS === 'ios'
export const googleSignInAvailable = true

const failed = (message: string): SocialSignInResult => ({ status: 'failed', message })

let googleConfigured = false

export async function signInWithGoogle(): Promise<SocialSignInResult> {
  if (!GOOGLE_WEB_CLIENT_ID || (Platform.OS === 'ios' && !GOOGLE_IOS_CLIENT_ID)) {
    return failed(
      'Google sign-in is not configured: set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID for iOS), then rebuild.'
    )
  }
  try {
    if (!googleConfigured) {
      // webClientId is required even in a native app: it makes Google issue the
      // ID token for the web client, which is the first client ID Supabase checks.
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID })
      googleConfigured = true
    }
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    const response = await GoogleSignin.signIn()
    if (!isSuccessResponse(response)) return { status: 'cancelled' }
    const idToken = response.data.idToken
    if (!idToken) return failed('Google didn’t confirm who you are. Please try again.')
    // On iOS the Google SDK puts its own nonce in the token: turn on
    // "Skip nonce check" for Google in Supabase, or this call fails.
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
    return error ? failed(error.message) : { status: 'signed-in' }
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.IN_PROGRESS) return { status: 'cancelled' }
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return failed('Google sign-in needs Google Play services on this phone. You can use your email instead.')
      }
      // DEVELOPER_ERROR on Android almost always means the SHA-1 of the key that
      // signed this build isn't on an Android OAuth client (Play re-signs store
      // installs with its own key: register both SHA-1s, docs/02).
    }
    return failed(e instanceof Error ? e.message : 'Google sign-in didn’t work. Please try again.')
  }
}

export async function signInWithApple(): Promise<SocialSignInResult> {
  try {
    // Apple gets the SHA-256 of the nonce and Supabase the raw value, so a
    // captured token can't be replayed.
    const rawNonce = Crypto.randomUUID()
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce)
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    })
    if (!credential.identityToken) return failed('Apple didn’t confirm who you are. Please try again.')
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    })
    if (error) return failed(error.message)

    // Apple shares the name only on the very first authorization, and never in
    // the token. Save it now so onboarding can fill it in: App Review rejects
    // apps that make people type their name again after Sign in with Apple.
    const given = credential.fullName?.givenName?.trim()
    const family = credential.fullName?.familyName?.trim()
    if (given || family) {
      await supabase.auth
        .updateUser({ data: { full_name: [given, family].filter(Boolean).join(' '), given_name: given || undefined } })
        .catch(() => {})
    }
    return { status: 'signed-in' }
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' }
    return failed(e?.message || 'Apple sign-in didn’t work. Please try again.')
  }
}

/**
 * Asks Apple to confirm once more before the account is deleted. The server
 * exchanges this code and revokes the app's Apple token, which App Review
 * requires (guideline 5.1.1(v)). Returns null if the person cancels.
 */
export async function appleAuthorizationCode(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] })
    return credential.authorizationCode ?? null
  } catch {
    return null
  }
}

/** Call from your sign-out: forgets the Google account on this device, so the next sign-in shows the account picker. */
export async function signOutSocial(): Promise<void> {
  if (googleConfigured) await GoogleSignin.signOut().catch(() => {})
}
