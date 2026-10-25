# 11. Troubleshooting

**What you'll have at the end:** a fast route from a symptom to its fix. Every entry here happened while building this. Each one gives **Symptom → Cause → Fix**.

## Redirects and sessions

**Password reset or confirm links open the home page, with no form**
- Cause: the `redirectTo` / `emailRedirectTo` your app sends isn't in **Authentication → URL Configuration → Redirect URLs**. Supabase doesn't error; it silently uses the Site URL.
- Fix: add the address, or a `/**` pattern. Prove it with `scripts/check-redirects.mjs`, which uses admin `generate_link`, sends no email, and reads back `redirect_to`.

**Web OAuth comes back to the Site URL instead of the web app**
- Cause: same as above, for `window.location.origin`. Often a preview deploy's origin.
- Fix: add that exact origin while testing, and remove it afterwards ([08](08-web-app.md)).

**Web OAuth returns, but the user isn't signed in**
- Cause: `detectSessionInUrl: false`, and nothing reads the `#access_token=…` hash.
- Fix: in your deep-link or initial-URL handler, parse the hash and call `supabase.auth.setSession({ access_token, refresh_token })`.

## Google

**`Error 400: redirect_uri_mismatch` on the web**
- Cause: the Web client's Authorized redirect URI isn't exactly `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
- Fix: correct it in Google Auth Platform → Clients → your web client.

**iOS: "Nonces mismatch" or "Passed nonce and nonce in id_token should either both exist or not"**
- Cause: the Google SDK on iOS puts its own nonce in the token.
- Fix: Supabase → Google provider → **Skip nonce check** on.

**Native: Supabase says the audience or client ID isn't allowed**
- Cause: the token was issued for a client that isn't in Supabase's Client IDs, often because `webClientId` wasn't set in `GoogleSignin.configure`.
- Fix: set `webClientId` to the Web client. List the web client first, then the Android and iOS IDs.

**Android: `DEVELOPER_ERROR`, or the picker closes with nothing**
- Cause: no Android client matches the package name plus the signing SHA-1 of **this** install. Play installs use the Play app-signing key, and direct installs use the upload key.
- Fix: create both Android clients ([02, step 3](02-google-cloud.md#step-3-get-your-two-android-sha-1-fingerprints)).

**Prebuild fails: "Missing `iosUrlScheme`"**
- Cause: the Google config plugin needs the reversed iOS client ID.
- Fix: set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` at build time, including in `eas.json` env; the template config derives the scheme from it.

**Only test users can sign in with Google**
- Cause: the consent screen is still in **Testing**.
- Fix: Google Auth Platform → Audience → **Publish app**.

**Google asks for verification after you add a logo**
- Cause: a logo triggers brand verification.
- Fix: remove the logo until you're ready to go through verification. Basic scopes need no review without it.

**After sign-out, Google signs straight back into the same account**
- Cause: the Google SDK still has a session.
- Fix: call `signOutSocial()` (which runs `GoogleSignin.signOut()`) in your app's sign-out.

## Apple

**"Bad ID token" or "invalid nonce" from Supabase**
- Cause: the nonce was swapped. Apple must get **SHA-256(raw)**, and Supabase must get **raw**.
- Fix: see the template's `signInWithApple`.

**The user's name is empty for Apple sign-ins**
- Cause: Apple sends the name only on the **first** authorization, and never in the token.
- Fix: save `credential.fullName` with `updateUser({ data: { full_name, given_name } })` right after the first sign-in. To test again, remove the app under Settings → Apple ID → Sign in with Apple, which resets "first time".

**`invalid_client` from Apple (revoke or web sign-in)**
- Cause: wrong Team ID or Key ID, the wrong `.p8`, a client ID that isn't linked to the key, or `sub` isn't the client you're using (the bundle ID on native, the Services ID on the web).
- Fix: run `scripts/check-apple-key.mjs` (offline checks), then prove it with a real code: `--code <fresh code>`.

**"The key check said `invalid_grant`, but revocation fails"**
- Cause: a fake authorization code always gets `invalid_grant`, because Apple rejects the code before it reads your secret. That answer never meant the key was right.
- Fix: test with a fresh real code (`check-apple-key.mjs --code`), or a real sign-in.

**Web: Apple says `invalid_client` or "Invalid web redirect url"**
- Cause: one of:
  - the Services ID isn't **first** in Supabase's Apple Client IDs;
  - the Services ID's domain or return URL isn't `YOUR_PROJECT_REF.supabase.co` and `…/auth/v1/callback`;
  - the web secret expired.
- Fix: reorder the IDs, correct the Services ID, or rerun `scripts/apple-web-secret.mjs`.

**Web Apple sign-in stopped working after about 6 months**
- Cause: the web client secret expired. Apple caps it at 6 months.
- Fix: `node scripts/apple-web-secret.mjs`, then set the next calendar reminder.

**Emails never reach `@privaterelay.appleid.com` users**
- Cause: your sending domain or address isn't registered with Apple, or SPF/DKIM fail.
- Fix: register it under Sign in with Apple for Email Communication, and use custom SMTP ([appendix](appendix-auth-emails.md)).

**App Review rejects with "requires users to provide their name or email after using Sign in with Apple"**
- Fix: prefill, and make the name optional for Apple users ([06](06-consent-and-onboarding.md)).

**Lost the `.p8`**
- Cause: Apple only lets you download it once.
- Fix: create a new key, then update the Supabase secrets and regenerate the web secret.

## Builds

**iOS build fails at signing: the profile doesn't support Sign in with Apple, or lacks `com.apple.developer.applesignin`**
- Cause: turning the capability on invalidated the profile, and a non-interactive build reused the old one.
- Fix: run one build interactively with Apple login, or with an App Store Connect API key ([10](10-shipping-builds.md)).

**The app crashes on launch after an OTA update**
- Cause: the update imports the native Google or Apple modules, but the installed build doesn't contain them, because both share a runtime version.
- Fix: roll back the update. Ship sign-in only in a new build, and never OTA to older builds of that runtime.

**The web bundle fails, or is huge, because of the Google SDK**
- Cause: shared code imports `@react-native-google-signin/google-signin`.
- Fix: keep all native calls in `socialAuth.ts` and give the web its own `socialAuth.web.ts`. Grep the web export for `RNGoogleSignin`; it should find nothing.

## Accounts and deletion

**Deleting fails with "user not found" for some users**
- Cause: they signed in with Apple or Google but never finished onboarding, so there's no profile row.
- Fix: in the delete function, if there's no profile, revoke Apple, then delete the auth user ([07](07-account-deletion.md)).

**A web user with Apple can't delete their account**
- Cause: the app asked Apple to confirm on the web, where there's no native sheet.
- Fix: ask only when `Platform.OS === 'ios'`.

**One person, two accounts**
- Cause: Apple "Hide my email" produces a relay address, so Supabase can't link it to their real-email account. That's by design.
- Fix: none needed. Tell users to share their email if they want one account across methods.

**New social users never gave consent**
- Cause: consent lived only on the email sign-up form.
- Fix: make consent the first onboarding step for them ([06](06-consent-and-onboarding.md)).

## Verify

- [ ] When something breaks, find the symptom here first, then check the matching doc's **Verify** section.
