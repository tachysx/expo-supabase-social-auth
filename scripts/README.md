# Scripts

Zero-dependency helpers (Node 18+, bash). Run them from your app's repo; nothing here needs installing.
Secrets come from environment variables, never arguments, so they stay out of shell history where possible.

| Script | What it does | Needs |
|---|---|---|
| `configure-supabase-auth.mjs` | Turns on Google and/or Apple in Supabase Auth with the client IDs in the right order, "skip nonce check" for Google, and adds your return addresses. Dry run unless `--apply`. | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`; any of `GOOGLE_WEB_CLIENT_ID` + `GOOGLE_WEB_CLIENT_SECRET`, `GOOGLE_ANDROID_CLIENT_IDS`, `GOOGLE_IOS_CLIENT_ID`, `APPLE_BUNDLE_ID`, `APPLE_SERVICES_ID`, `REDIRECT_URLS` |
| `apple-web-secret.mjs` | Makes the 6-month client secret Apple requires for web sign-in, stores it in Supabase, prints the expiry date. `--dry-run` shows the claims only. | `APPLE_TEAM_ID`, `APPLE_SERVICES_ID`, `APPLE_BUNDLE_ID`, `APPLE_KEY_PATH`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` |
| `check-apple-key.mjs` | Checks the `.p8`, key ID, team ID and client ID offline; with `--code <fresh authorization code>` it does the real exchange + revoke with Apple. (A made-up code can't test a key: Apple answers `invalid_grant` even to a garbage secret.) | `APPLE_TEAM_ID`, `APPLE_KEY_PATH`, client ID as argument |
| `check-redirects.mjs` | Shows whether Supabase keeps each return address or swaps it for the Site URL. Sends no email. | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TEST_EMAIL` (an existing user), URLs as arguments |
| `android-sha1.sh` | Prints the SHA-1 of your latest EAS Android build's signing key, for the Android OAuth client. | `eas-cli` login, a JDK (`keytool`) |
| `check-ios-entitlements.sh` | Confirms an iOS build has the Sign in with Apple entitlement and Google's URL scheme. macOS. | `eas-cli` login (or an `.ipa` path) |

## Examples

```bash
# 1. Supabase providers (preview, then apply)
export SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=abcdefghijklmnop
GOOGLE_WEB_CLIENT_ID=111-web.apps.googleusercontent.com GOOGLE_WEB_CLIENT_SECRET=GOCSPX-xxx \
GOOGLE_ANDROID_CLIENT_IDS=111-play.apps.googleusercontent.com,111-upload.apps.googleusercontent.com \
GOOGLE_IOS_CLIENT_ID=111-ios.apps.googleusercontent.com \
APPLE_BUNDLE_ID=com.example.app APPLE_SERVICES_ID=com.example.app.web \
REDIRECT_URLS='https://app.example.com/**' \
node scripts/configure-supabase-auth.mjs            # add --apply when the preview looks right

# 2. Apple key check (offline; add --code <fresh authorization code> for the real test with Apple)
APPLE_TEAM_ID=ABCDE12345 APPLE_KEY_PATH=~/secrets/AuthKey_KEYID12345.p8 \
node scripts/check-apple-key.mjs com.example.app

# 3. Apple web secret (repeat before the printed expiry date)
APPLE_TEAM_ID=ABCDE12345 APPLE_SERVICES_ID=com.example.app.web APPLE_BUNDLE_ID=com.example.app \
APPLE_KEY_PATH=~/secrets/AuthKey_KEYID12345.p8 node scripts/apple-web-secret.mjs

# 4. Return addresses
SUPABASE_URL=https://abcdefghijklmnop.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx TEST_EMAIL=test@example.com \
node scripts/check-redirects.mjs https://app.example.com/ myapp://auth/reset-password

# 5. Android SHA-1 and iOS entitlements
bash scripts/android-sha1.sh
bash scripts/check-ios-entitlements.sh <eas-build-id>
```

Keep the `.p8` file outside your repo (e.g. `~/secrets/`, `chmod 600`). Apple lets you download it only once.
