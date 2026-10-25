# 4. Supabase: providers, redirect URLs, secrets

**What you'll have at the end:**
- Google and Apple turned on in Supabase Auth, with client IDs in the right order;
- the web secret for Apple;
- every address your app returns to on Supabase's allow list;
- the Edge Function secrets the delete function needs.

Every setting can be clicked in the dashboard or applied with `scripts/configure-supabase-auth.mjs`. The script uses the Management API and does a dry run unless you pass `--apply`.

You need a **personal access token** for the scripts: supabase.com/dashboard/account/tokens → Generate. Keep it in a gitignored env file as `SUPABASE_ACCESS_TOKEN`. Your project ref is the `YOUR_PROJECT_REF` in `https://YOUR_PROJECT_REF.supabase.co`.

## Step 1: Redirect URLs (do this first)

*Who does this: Either*

Dashboard: **Authentication → URL Configuration**.

- **Site URL:** your main website, for example `https://example.com`.
- **Redirect URLs:** every address your app sends as `redirectTo` or `emailRedirectTo`. For example:

```
myapp://**                       # native deep links (your Expo scheme)
https://app.example.com/**       # your web app
https://example.com/auth/**      # web pages that handle email links
```

> **Supabase does not error on an unlisted address.** It silently sends the user to the **Site URL** instead. Our password-reset links landed on the marketing home page, with no form to set a new password, until we checked.

## Step 2: Google provider

*Who does this: Either*

Dashboard: **Authentication → Sign In / Providers → Google → Enable**.

| Field | Value |
|---|---|
| Client IDs | `WEB_ID,ANDROID_PLAY_ID,ANDROID_UPLOAD_ID,IOS_ID`, with the **web client first** |
| Client Secret | the web client's secret (`GOCSPX-…`) |
| Skip nonce check | **On.** The Google SDK on iOS adds its own nonce that your app can't pass to Supabase. Without this, iOS Google sign-in fails with a nonce error. |

The web redirect flow uses the first client ID. Native sign-ins accept any listed ID.

## Step 3: Apple provider

*Who does this: Either*

Dashboard: **Authentication → Sign In / Providers → Apple → Enable**.

| Field | Value |
|---|---|
| Client IDs | `com.example.app.web,com.example.app`: **Services ID first**, then the bundle ID. Native-only? Just `com.example.app`. |
| Secret Key (for OAuth) | Only for the web: an ES256 JWT signed with your `.p8`, `sub` = Services ID, **expires after at most 6 months** |

The web flow uses the first client ID. If the bundle ID comes first, native sign-in still works but web sign-in is rejected.

Generate and store the web secret with the script, which prints the expiry date:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=YOUR_PROJECT_REF \
APPLE_TEAM_ID=ABCDE12345 APPLE_BUNDLE_ID=com.example.app APPLE_SERVICES_ID=com.example.app.web \
APPLE_KEY_PATH=~/.config/<app>/AuthKey_KEYID12345.p8 \
node scripts/apple-web-secret.mjs
```

**Put the expiry date in your calendar** (it's 180 days out). When it lapses, only web Apple sign-in breaks; the iOS app never uses this secret.

## Step 4: Everything at once, with the script

*Who does this: Your AI agent*

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=YOUR_PROJECT_REF \
GOOGLE_WEB_CLIENT_ID=... GOOGLE_WEB_CLIENT_SECRET=... \
GOOGLE_ANDROID_CLIENT_IDS=...,... GOOGLE_IOS_CLIENT_ID=... \
APPLE_BUNDLE_ID=com.example.app APPLE_SERVICES_ID=com.example.app.web \
REDIRECT_URLS="myapp://**,https://app.example.com/**" \
node scripts/configure-supabase-auth.mjs          # dry run: prints the change
# ...then the same command with --apply
```

The script keeps your existing Redirect URLs and only adds new ones. It never prints secrets.

## Step 5: Edge Function secrets for account deletion

*Who does this: Your AI agent*

The `delete-account` function ([07](07-account-deletion.md)) revokes Apple tokens. It needs:

```bash
npx supabase secrets set --project-ref YOUR_PROJECT_REF \
  APPLE_TEAM_ID=ABCDE12345 \
  APPLE_BUNDLE_ID=com.example.app \
  APPLE_SIWA_KEY_ID=KEYID12345 \
  "APPLE_SIWA_PRIVATE_KEY=$(tr -d '\n' < ~/.config/<app>/AuthKey_KEYID12345.p8)"
```

Storing the key on one line is fine: the template strips the PEM header, footer and whitespace before reading it. `supabase secrets list` shows only digests, so the key is never printed.

## Step 6: Email settings that matter here

*Who does this: You (console)*

- **Authentication → Emails → SMTP Settings:** use custom SMTP, not the built-in sender. The built-in one is rate-limited per project, and you can't register its sending domain with Apple's private relay, so mail to relay addresses won't arrive. See the [appendix](appendix-auth-emails.md).
- Leave **Confirm email** on for email sign-ups. Social sign-ups arrive already verified.

## Verify

*Who does this: Your AI agent*

```bash
# 1. Which return addresses does Supabase honour? Uses admin generate_link, which sends no email.
#    TEST_EMAIL is any existing test user; the generated link is never used.
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co SUPABASE_SERVICE_ROLE_KEY=... TEST_EMAIL=test@example.com \
node scripts/check-redirects.mjs myapp://auth/reset-password https://app.example.com/
# Each address must come back unchanged. The Site URL coming back means it isn't allowed.

# 2. Do both providers redirect with the right client?
for p in google apple; do
  curl -s -o /dev/null -w "$p: %{redirect_url}\n" \
    "https://YOUR_PROJECT_REF.supabase.co/auth/v1/authorize?provider=$p&redirect_to=https://app.example.com/"
done
# google → accounts.google.com, client_id = web client
# apple  → appleid.apple.com, client_id = com.example.app.web
```

- [ ] `check-redirects.mjs` gives back every address your app uses unchanged.
- [ ] Google redirects with the web client ID, and Apple with the Services ID.
- [ ] `supabase secrets list` shows `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`, `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_PRIVATE_KEY`.
- [ ] The Apple web secret's expiry date is in your calendar.
