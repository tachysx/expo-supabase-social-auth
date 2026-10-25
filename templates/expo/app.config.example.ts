/**
 * The parts of app.config.ts that social sign-in needs. Merge into your own
 * config; don't replace it.
 *
 * Both plugins add native code, so the change ships in a new EAS build, never
 * an OTA update (docs/10).
 */
import type { ExpoConfig } from 'expo/config'

// Google's iOS URL scheme is the iOS OAuth client ID reversed:
// 1234-abcd.apps.googleusercontent.com → com.googleusercontent.apps.1234-abcd
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''
const googleIosUrlScheme = iosClientId.split('.').reverse().join('.')
if (!googleIosUrlScheme.startsWith('com.googleusercontent.apps.')) {
  throw new Error('Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (the iOS OAuth client ID) before building.')
}

const config: ExpoConfig = {
  name: 'Example',
  slug: 'example',
  scheme: 'example',
  ios: {
    bundleIdentifier: 'com.example.app',
    // Adds the com.apple.developer.applesignin entitlement. Enabling it on the
    // App ID invalidates your provisioning profile: run the first build after
    // this interactively (Apple login) so EAS can sync capabilities.
    usesAppleSignIn: true,
  },
  android: {
    package: 'com.example.app',
  },
  plugins: [
    'expo-apple-authentication',
    ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }],
    // ...your other plugins
  ],
  extra: {
    // EXPO_PUBLIC_* values are inlined at build time; on EAS set them in
    // eas.json "env" for each build profile (or as EAS environment variables).
  },
}

export default config
