# 1. How it works

**What you'll have at the end:** a clear picture of the moving parts. You'll know which flow runs where, which console holds which setting, and why each setting exists. The rest of the tutorial builds these parts one by one.

## The short version

| Platform | Apple | Google | How the session is made |
|---|---|---|---|
| iOS app | Apple's native sheet (`expo-apple-authentication`) | Google's native sheet (`@react-native-google-signin/google-signin`) | The app gets an **ID token** and calls `supabase.auth.signInWithIdToken` |
| Android app | Not offered (no Apple sheet on Android) | Google's native account picker | Same: ID token → `signInWithIdToken` |
| Web app (react-native-web) | Supabase OAuth redirect to Apple | Supabase OAuth redirect to Google | Browser leaves, comes back with the session in the URL |

No passwords are involved. Supabase checks every token against the client IDs you list in its provider settings.

## Native flow (iOS and Android)

```
App ──► Apple/Google native sheet ──► ID token (a signed JWT)
App ──► supabase.auth.signInWithIdToken({ provider, token, nonce? })
Supabase ──► checks signature, audience (your client IDs) and nonce ──► session
```

- **Google:** the ID token's audience must be a client ID that Supabase knows. You set `webClientId` in the Google SDK, so the token is issued for your **Web** client. You list the web client first in Supabase.
- **Apple:** the audience is your iOS bundle ID (`com.example.app`). You send a hashed nonce to Apple and the raw nonce to Supabase. That stops a stolen token being replayed.

## Web flow

```
Browser ──► supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
        ──► Apple/Google sign-in page
        ──► https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
        ──► redirectTo#access_token=…&refresh_token=…
App reads the hash and stores the session.
```

- `redirectTo` **must** be on Supabase's Redirect URLs list. Otherwise Supabase silently sends people to your Site URL instead. See [11. Troubleshooting](11-troubleshooting.md).
- Apple on the web needs a **Services ID** (`com.example.app.web`) and a client secret that expires every 6 months. Native iOS needs neither.

## Where each setting lives

| Console | What you create there | Doc |
|---|---|---|
| Google Cloud → Google Auth Platform | Consent screen, 1 Web client, 2 Android clients, 1 iOS client | [02](02-google-cloud.md) |
| Apple Developer | Sign in with Apple on the App ID, a SIWA key (.p8), a Services ID for web, email relay | [03](03-apple-developer.md) |
| Supabase → Authentication | Google + Apple providers, Redirect URLs, Edge Function secrets | [04](04-supabase.md) |
| Your Expo app | `socialAuth.ts` / `socialAuth.web.ts`, the buttons, config plugins | [05](05-expo-app.md) |

## Things that are easy to miss

1. **Consent.** Social sign-ups never see your email sign-up form. If that form collects consent (GDPR, PDPA and so on), ask for it in onboarding instead. See [06](06-consent-and-onboarding.md).
2. **Account deletion.** Apple requires you to revoke the user's Sign in with Apple token when they delete their account (App Store guideline 5.1.1(v)). See [07](07-account-deletion.md).
3. **Account linking.** Supabase links a Google or Apple login to an existing account with the same verified email. One user can end up with three identities: email, Google and Apple. Apple's "Hide my email" gives a relay address, so it creates a separate account.
4. **Store rules.**
   - Offering Google on iOS means you must also offer Sign in with Apple (guideline 4.8).
   - Apple's button must be at least as prominent as the others.
   - Don't make people retype a name or email after Sign in with Apple.
5. **Builds.** The sign-in SDKs are native modules, so you need a new store build. Never send an over-the-air update that imports them to an older build that doesn't have them.

## Who does what

The tutorial tags every step:

- **You (console):** clicks in Google Cloud, Apple Developer and the Supabase dashboard. These need your logins and sometimes 2FA, so an AI agent can't do them.
- **Your AI agent:** code, config, scripts, deploys and verification commands.
- **Either:** anything that works from a terminal with the right tokens.

The agent playbook in [`SKILL.md`](../SKILL.md) follows the same order as these docs. It stops and waits for you at each console step.

## Tested with

- Expo SDK 54+ (built and shipped on SDK 57 with the New Architecture), expo-router, EAS Build.
- Supabase Auth and Edge Functions (Deno).
- Web via `expo export -p web` (react-native-web).

## Verify

You're ready to start when you can answer these:

- [ ] Which platforms get Apple, and which get Google? The default is Apple on iOS and web, Google everywhere.
- [ ] Do you have admin access to Google Cloud, Apple Developer (Account Holder or Admin role) and the Supabase project?
- [ ] Is your app built with EAS (or another native build) rather than Expo Go? The Google SDK needs a development or store build.
