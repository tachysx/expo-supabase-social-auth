# 5. The Expo app: packages, config, sign-in code, buttons

**What you'll have at the end:**
- a sign-in screen with **Continue with Apple** (iOS app and web) and **Continue with Google** (iOS, Android, web) above your email form;
- a native ID-token flow on iOS and Android, and Supabase's redirect on the web;
- a web bundle that never contains the native Google module.

Tested on Expo SDK 57 with the New Architecture; it works on SDK 54+.

## Step 1: Install the packages

*Who does this: Your AI agent*

```bash
npx expo install expo-apple-authentication expo-crypto @react-native-google-signin/google-signin
```

`expo install` picks versions that match your SDK. The free `@react-native-google-signin/google-signin` (v13+) returns `{ type: 'success' | 'cancelled' }` from `signIn()`. Older guides that expect it to throw on cancel are out of date.

## Step 2: Config plugins and the Apple capability

*Who does this: Your AI agent*

See `templates/expo/app.config.example.ts`. The parts that matter:

```ts
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''
// Google's iOS URL scheme is the iOS client ID reversed.
const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`

export default {
  ios: { bundleIdentifier: 'com.example.app', usesAppleSignIn: true },
  android: { package: 'com.example.app' },
  plugins: [
    'expo-apple-authentication',
    ['@react-native-google-signin/google-signin', { iosUrlScheme }],
  ],
}
```

- `usesAppleSignIn: true` adds the `com.apple.developer.applesignin` entitlement.
- The Google plugin throws at prebuild if `iosUrlScheme` is missing or doesn't start with `com.googleusercontent.apps.`.
- Put `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in `.env` for local runs, and in `eas.json` → `build.<profile>.env` for EAS builds. See `templates/expo/.env.example`. They're client IDs, not secrets.

## Step 3: Copy the sign-in module

*Who does this: Your AI agent*

Copy `templates/expo/lib/socialAuth.ts` and `templates/expo/lib/socialAuth.web.ts` next to your Supabase client. They import it as `import { supabase } from './supabase'`; change the path if yours lives elsewhere.

Both files export the same API, so screens never check `Platform`:

```ts
type SocialSignInResult = { status: 'signed-in' } | { status: 'cancelled' } | { status: 'failed'; message: string }
appleSignInAvailable: boolean
googleSignInAvailable: boolean
signInWithGoogle(): Promise<SocialSignInResult>
signInWithApple(): Promise<SocialSignInResult>
appleAuthorizationCode(): Promise<string | null>   // for account deletion, see doc 07
signOutSocial(): Promise<void>
```

Metro picks `socialAuth.web.ts` for the web build, so the native Google module never lands in the web bundle.

### What the native file does

- **Google:**
  1. `GoogleSignin.configure({ webClientId, iosClientId })`, once.
  2. On Android, `hasPlayServices()` first.
  3. `signIn()`. A `cancelled` result returns `{ status: 'cancelled' }`; don't show an error for that.
  4. `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`.
- **Apple:**
  1. Make a random raw nonce with `expo-crypto`. Send **SHA-256(raw)** to Apple and the **raw** value to Supabase.
  2. `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL], nonce: hashed })`.
  3. `signInWithIdToken({ provider: 'apple', token: identityToken, nonce: raw })`.
  4. **Apple sends the user's name only on the very first authorization, and never inside the token.** If `credential.fullName` is set, save it at once:
     ```ts
     await supabase.auth.updateUser({ data: { full_name, given_name } })
     ```
     Onboarding reads it from `user.user_metadata`. See [06](06-consent-and-onboarding.md).
  5. The error code `ERR_REQUEST_CANCELED` means the user cancelled.
- **Sign-out:** `signOutSocial()` calls `GoogleSignin.signOut()`, so the next sign-in shows the account picker again. Call it inside your app's sign-out, before `supabase.auth.signOut()`.

### What the web file does

`signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })`, then a promise that never resolves, because the page is leaving. When the browser comes back, the URL hash holds `access_token` and `refresh_token`.

- **If your Supabase client has `detectSessionInUrl: true`** (the web default), the session is picked up for you.
- **If you turned it off** (common in apps that share code with native), read the hash in your deep-link handler and call `supabase.auth.setSession({ access_token, refresh_token })`, then route to `/`.

## Step 4: The buttons

*Who does this: Your AI agent*

`templates/expo/components/SocialSignIn.tsx` uses plain React Native components:

```tsx
<SocialSignIn
  disabled={emailFormBusy}
  colorScheme={isDark ? 'dark' : 'light'}
  onSignedIn={goToApp}              // same routing as your password sign-in
  onError={message => setFormError(message)}
/>
```

Rules it follows:
- **Apple first, the same size as Google.** Apple requires Sign in with Apple to be at least as prominent as other sign-in options (guideline 4.8).
- **iOS:** Apple's own `AppleAuthenticationButton`, `CONTINUE` type, black in light mode and white in dark.
- **Web:** Apple's native button doesn't exist there, so the component draws one to Apple's rules: black, or white in dark mode, the Apple logo, "Continue with Apple". The Apple logo is `assets/apple-logo.png`, tinted with `tintColor`.
- **Google:** a light button with the colour **G** (`assets/google-g.png`) and "Continue with Google", per Google's branding guidelines.
- While one provider is busy, the other button is dimmed and disabled.

Put the buttons **above** the email form, then an "or use your email" divider. They work for both sign-in and sign-up. Supabase creates the account on first use.

## Step 5: After sign-in, route like a password sign-in

*Who does this: Your AI agent*

Reuse one function for every sign-in method:

```ts
const goToApp = async () => {
  const { data } = await supabase.auth.getSession()
  const profile = await fetchProfile(data.session?.access_token)   // your API
  router.replace(profile?.onboarded ? '/home' : '/onboarding')
}
```

A brand-new social user has no profile row yet, so they go to onboarding. That's where consent and the name live ([06](06-consent-and-onboarding.md)).

## Verify

*Who does this: Your AI agent*

```bash
npx tsc --noEmit
npx expo export -p web --output-dir /tmp/web-check
grep -c "RNGoogleSignin" /tmp/web-check/_expo/static/js/web/entry-*.js          # must be 0
grep -c "signInWithOAuth" /tmp/web-check/_expo/static/js/web/entry-*.js         # must be > 0
npx expo export -p ios --output-dir /tmp/ios-check
strings /tmp/ios-check/_expo/static/js/ios/*.hbc | grep -c RNGoogleSignin       # must be > 0
```

- [ ] Type check passes.
- [ ] The web bundle has no native Google module, and the iOS bundle has it.
- [ ] Locally on the web, the sign-in screen shows Apple, then Google, then "or use your email".
- [ ] Real device sign-ins are tested after the build: [09](09-testing-and-verification.md).
