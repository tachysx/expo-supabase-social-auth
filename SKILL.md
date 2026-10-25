---
name: expo-supabase-social-auth
description: Add Sign in with Apple and Sign in with Google to an Expo (React Native) app that uses Supabase Auth, on iOS, Android and web, end to end. Covers the Google Cloud and Apple Developer console checklists for the human, Supabase provider config, the app code (from templates/), a consent step for social sign-ups, Apple token revocation on account deletion, web sign-in, verification and shipping. Use when asked to add Apple or Google login, social sign-in, or OAuth to an Expo / React Native + Supabase project.
---

# Social sign-in for Expo + Supabase: agent playbook

You are adding **Sign in with Apple** (iOS app + web) and **Sign in with Google** (iOS, Android, web) to an existing
Expo app that signs users in with Supabase Auth. This playbook was extracted from a real production rollout; every
step and check below exists because something broke without it.

Paths below are relative to this skill's folder. `docs/` has the full tutorial, `templates/` the code you copy,
`scripts/` the zero-dependency helpers (Node 18+).

## Ground rules

1. **Split the work.** Console clicks in Google Cloud and Apple Developer are the human's. Generate a checklist
   with the project's real values filled in, then wait for the IDs. Everything else (code, Supabase config,
   deploys, checks) is yours.
2. **Secrets never go through chat.** Client secrets go into the project's untracked env file (for example
   `.env.local`). The Apple `.p8` key goes into a private folder such as `~/.config/<app>/`, and you read it by path.
   Client IDs are public, so they can be pasted.
3. **Production changes need the human's explicit OK:** Supabase auth config, secrets, edge-function deploys, merges
   that deploy, store submissions. Show the dry run or diff first. All scripts dry-run by default.
4. **Verify every step with the cheapest proof.** A script, a curl, a type check or a bundle grep each count. "It should
   work" is not done. Each phase ends with its check.
5. **Don't break existing users.** Keep email sign-in working. A Google or Apple login with the same verified
   email links to the existing account.

## Phase 0: Discover (agent)
Read the project before planning. Find these, and note anything that differs from the templates' assumptions:
- Expo SDK (`npx expo --version`, `package.json`). SDK 54+ expected; tested on 57.
- iOS bundle ID and Android package (`app.config.*`), the EAS project (`eas.json`), and whether there's a web build.
- The Supabase client module and its options. `detectSessionInUrl` matters on web; see `docs/08-web-app.md`.
- Sign-in and sign-up screens, post-sign-in routing, onboarding, and where consent (GDPR/PDPA/etc.) is recorded.
- Account deletion: the endpoint or edge function that deletes the user, and whether it fails when there's no
  profile row.
- Supabase Site URL and redirect allow list (Management API `GET /v1/projects/{ref}/config/auth`, or ask the human).

Write a short plan back to the human: platforms, files you'll touch, the console steps they'll do, and the open
questions. One question matters most: **which platforms get which button?** Recommended: Apple on iOS and web,
Google everywhere. Apple guideline 4.8 requires Sign in with Apple on iOS once Google is offered there.

## Phase 1: Console setup (human; you prepare the checklist)
Follow `docs/02-google-cloud.md` and `docs/03-apple-developer.md`, and fill in the project's values.
- Get the Android upload-key SHA-1 for them: `scripts/android-sha1.sh`. The Play app-signing SHA-1 comes from Play
  Console → App integrity.
- Google: consent screen published, plus four OAuth clients: Web (redirect `https://<ref>.supabase.co/auth/v1/callback`),
  Android ×2 (Play signing SHA-1, upload SHA-1) and iOS.
- Apple:
  - Sign In with Apple capability on the App ID.
  - Sign in with Apple **key** (`.p8`, downloadable once).
  - Services ID for web, with domain `<ref>.supabase.co` and return URL `…/auth/v1/callback`.
  - Email relay registration (domain + from-address).

**Checkpoint:** you have 4 Google client IDs, the web client secret is in the env file, the `.p8` path, the key ID
(it's in the file name), the team ID and the Services ID. Run `node scripts/check-apple-key.mjs <bundle ID>` for the
offline key checks.
- **Never treat `invalid_grant` on a made-up code as proof.** Apple rejects the code before it looks at the secret.
- The real proofs come later: a web Apple sign-in in Phase 5, the delete log showing `apple_token: revoked` in
  Phase 6, or `--code` with a fresh code.

## Phase 2: Supabase Auth config (agent, human approves)
`node scripts/configure-supabase-auth.mjs` (dry run) → show the human → `--apply`.
- **Google:** client IDs **web first**, then Android and iOS; the secret; **skip nonce check on** (needed for iOS).
- **Apple:** client IDs **Services ID first**, then the bundle ID. The web secret comes from
  `node scripts/apple-web-secret.mjs`. It expires within 6 months, so tell the human the date and add it to their
  task list.
- **Redirect allow list:** add every origin the web app and deep links return to. Supabase silently swaps any other
  `redirectTo` for the Site URL.

**Checkpoint:**
- `node scripts/check-redirects.mjs <urls…>` shows every URL as allowed. It sends no email.
- `curl -sI "https://<ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=<origin>"` redirects to Google
  with the web client ID.
- The same curl with `provider=apple` redirects to Apple with the Services ID.

## Phase 3: App code (agent)
See `docs/05-expo-app.md` and `docs/06-consent-and-onboarding.md`.
1. `npx expo install expo-apple-authentication expo-crypto @react-native-google-signin/google-signin`
2. Copy `templates/expo/lib/socialAuth.ts`, `socialAuth.web.ts` and `components/SocialSignIn.tsx`, plus the two
   assets, and fix the `./supabase` import path. Restyle the buttons to the app's design system while keeping
   Apple's and Google's button rules: Apple first, same size.
3. Add the config from `templates/expo/app.config.example.ts`: `ios.usesAppleSignIn`, both plugins, and
   `iosUrlScheme`. Put the env vars from `templates/expo/.env.example` in every EAS build profile.
4. Put `SocialSignIn` above the email form, and route after sign-in exactly like the password path does.
5. **Consent:** social sign-ups never see the email form, so make consent the first onboarding step whenever none is
   on file. It must come before any sensitive question. Store it the same way as the email path.
6. **Name:** prefill from `user_metadata` (Google) or the value saved after Apple's first authorization. Never require
   Apple users to retype it.
7. Call `signOutSocial()` in the app's sign-out.

**Checkpoint:**
- The type check and the project's lint pass.
- `npx expo export -p web` succeeds, and grepping the web bundle for `RNGoogleSignin` finds 0 matches.
- The iOS export includes `ExpoAppleAuthentication`.

## Phase 4: Account deletion (agent, human approves the deploy)
See `docs/07-account-deletion.md`.
- Server: add `templates/supabase/functions/_shared/apple-signin.ts`, and either merge the revoke step into the
  existing delete function or start from `templates/supabase/functions/delete-account/`.
  - Revocation never blocks a deletion; it gets logged instead.
  - A login with no profile row must still delete.
- Secrets: `supabase secrets set APPLE_TEAM_ID=… APPLE_BUNDLE_ID=… APPLE_SIWA_KEY_ID=… APPLE_SIWA_PRIVATE_KEY="$(tr -d '\n' < key.p8)"`.
- App (iOS only): if the user has an `apple` identity, call `appleAuthorizationCode()` before deleting and send it as
  `{ appleAuthorizationCode }`. If they cancel, stop.

**Checkpoint:**
- The Deno test passes: `deno test templates/supabase/functions/_shared/apple-signin.test.ts`.
- On production, create a throwaway confirmed user through the admin API, delete it through the function, and
  confirm the login is gone (404).

## Phase 5: Web app (agent; human tests)
See `docs/08-web-app.md`.
1. Deploy a **preview** of the web build.
2. Add its exact origin to the allow list.
3. The human tests:
   - an existing email account signing in with Google and with Apple, which should end up as **one** user with
     several identities;
   - a brand-new account, which should get the consent step, then onboarding.
4. Check the database: identities per user, and the consent row saved.
5. Ship to production, then remove the preview origin from the allow list.

## Phase 6: Native builds (human runs the first one)
See `docs/10-shipping-builds.md`.
- Enabling Sign in with Apple **invalidates the provisioning profile**. The first EAS build afterwards must run
  interactively in the human's terminal (Apple login + 2FA), unless an App Store Connect API key is configured.
- Verify the IPA: `scripts/check-ios-entitlements.sh <build-id>` should show `com.apple.developer.applesignin` and
  the Google URL scheme.
- **Never ship an OTA update that imports these modules to a build that lacks them.** Builds with the same runtime
  version will crash on launch.
- Device test matrix: `docs/09-testing-and-verification.md`.

## Phase 7: Store and legal (agent drafts, human submits)
- **Privacy policy:** add a line saying that Apple and Google share name and email, and that Apple can share a relay
  address.
- **Apple App Privacy:** usually unchanged, since name and email are already declared.
- **Review notes:** say the sign-in buttons exist; keep the reviewer's email login.
- **Deleting an Apple account on iOS:** the user must re-confirm with Apple, and the token is revoked (guideline
  5.1.1(v)).

## Done means
Every checkpoint above has passed, and its output was shown to the human. Also confirm:
- the human signed in with Apple and with Google on every platform you enabled;
- a new social account recorded consent;
- an existing account gained identities instead of being duplicated;
- an Apple account was deleted with `apple_token: revoked` in the function log;
- the Apple web-secret expiry date is in the human's calendar or task list.

When something fails, check `docs/11-troubleshooting.md` first. It's indexed by symptom.
