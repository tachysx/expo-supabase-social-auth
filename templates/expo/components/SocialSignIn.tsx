/**
 * "Continue with Apple" and "Continue with Google", for the top of your
 * sign-in / sign-up screen. Plain React Native, so it drops into any app;
 * restyle freely within the providers' branding rules:
 * - Apple first, same size as Google, at least as prominent (App Review 4.8).
 *   iOS uses Apple's own button; the web draws one to Apple's rules (black, or
 *   white on dark backgrounds) because Apple's native button is iOS-only.
 * - Google: light button with the colour "G" logo and "Continue with Google".
 */
import { useState } from 'react'
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import {
  appleSignInAvailable,
  googleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
  type SocialSignInResult,
} from '../lib/socialAuth'

const BUTTON_HEIGHT = 52

// Brand colours set by Apple and Google; everything else is yours to theme.
const COLORS = {
  appleLight: { bg: '#000000', fg: '#FFFFFF' },
  appleDark: { bg: '#FFFFFF', fg: '#000000' },
  google: { bg: '#FFFFFF', fg: '#1F1F1F', border: '#747775' },
}

const googleMark = require('../assets/google-g.png')
const appleMark = require('../assets/apple-logo.png')

interface Props {
  /** Another sign-in (e.g. your email form) is running: ignore taps. */
  disabled?: boolean
  /** Called once Supabase has a session. Route to onboarding or home from here. */
  onSignedIn: () => Promise<void> | void
  onError: (message: string) => void
  colorScheme?: 'light' | 'dark'
}

export function SocialSignIn({ disabled, onSignedIn, onError, colorScheme = 'light' }: Props) {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null)
  const apple = colorScheme === 'dark' ? COLORS.appleDark : COLORS.appleLight

  const run = async (provider: 'apple' | 'google', signIn: () => Promise<SocialSignInResult>) => {
    if (busy || disabled) return
    setBusy(provider)
    try {
      const result = await signIn()
      if (result.status === 'signed-in') await onSignedIn()
      else if (result.status === 'failed') onError(result.message)
      // 'cancelled': the person closed the sheet; say nothing.
    } finally {
      setBusy(null)
    }
  }

  const dimmed = (provider: 'apple' | 'google') => (disabled || (busy !== null && busy !== provider) ? 0.45 : 1)

  return (
    <View style={styles.stack}>
      {appleSignInAvailable && Platform.OS === 'ios' ? (
        <View style={{ opacity: dimmed('apple') }} pointerEvents={busy || disabled ? 'none' : 'auto'}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              colorScheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={BUTTON_HEIGHT / 2}
            style={{ height: BUTTON_HEIGHT, width: '100%' }}
            onPress={() => run('apple', signInWithApple)}
          />
        </View>
      ) : appleSignInAvailable ? (
        <Pressable
          onPress={() => run('apple', signInWithApple)}
          disabled={!!busy || disabled}
          accessibilityRole="button"
          accessibilityLabel="Continue with Apple"
          accessibilityState={{ disabled: !!busy || disabled, busy: busy === 'apple' }}
          style={[styles.button, { backgroundColor: apple.bg, opacity: dimmed('apple') }]}
        >
          {busy === 'apple' ? (
            <ActivityIndicator color={apple.fg} />
          ) : (
            <>
              <Image source={appleMark} style={[styles.mark, { tintColor: apple.fg }]} />
              <Text style={[styles.label, { color: apple.fg }]}>Continue with Apple</Text>
            </>
          )}
        </Pressable>
      ) : null}

      {googleSignInAvailable ? (
        <Pressable
          onPress={() => run('google', signInWithGoogle)}
          disabled={!!busy || disabled}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          accessibilityState={{ disabled: !!busy || disabled, busy: busy === 'google' }}
          style={[
            styles.button,
            {
              backgroundColor: COLORS.google.bg,
              borderColor: COLORS.google.border,
              borderWidth: StyleSheet.hairlineWidth * 2,
              opacity: dimmed('google'),
            },
          ]}
        >
          {busy === 'google' ? (
            <ActivityIndicator color={COLORS.google.fg} />
          ) : (
            <>
              <Image source={googleMark} style={styles.mark} />
              <Text style={[styles.label, { color: COLORS.google.fg }]}>Continue with Google</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  button: {
    minHeight: BUTTON_HEIGHT,
    borderRadius: BUTTON_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  mark: { width: 20, height: 20 },
  label: { fontSize: 17, fontWeight: '600' },
})
