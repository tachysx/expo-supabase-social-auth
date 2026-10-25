# 3. Apple Developer: capability, key, Services ID, email relay

**What you'll have at the end:**
- Sign in with Apple turned on for your App ID;
- a Sign in with Apple key (`.p8`), used to revoke tokens when accounts are deleted and to sign the web secret;
- a Services ID for Apple on the web;
- your email domain registered with Apple's private relay.

You need the **Account Holder** or **Admin** role in the Apple Developer account. Other roles can't see Keys or Services.

All steps are at **developer.apple.com/account → Certificates, Identifiers & Profiles**.

## Step 1: Turn on Sign in with Apple for the app

*Who does this: You (console)*

1. **Identifiers** → your App ID (`com.example.app`).
2. Tick **Sign In with Apple** → leave "Enable as a primary App ID" → **Save** → confirm.

> **This invalidates your existing provisioning profiles.** Your next iOS build must regenerate them. See [10. Shipping builds](10-shipping-builds.md).

## Step 2: Create the Sign in with Apple key

*Who does this: You (console)*

1. **Keys → +**.
2. Name it, for example `<App> Sign in with Apple`. Tick **Sign in with Apple** → **Configure** → Primary App ID `com.example.app` → Save.
3. **Continue → Register.**
4. **Download the `.p8` now.** Apple lets you download it **only once**.
5. Note the **Key ID**. It's also in the filename: `AuthKey_KEYID12345.p8` means Key ID `KEYID12345`.

Store it outside any repo, readable only by you:

```bash
mkdir -p ~/.config/<app> && mv ~/Downloads/AuthKey_*.p8 ~/.config/<app>/ && chmod 600 ~/.config/<app>/AuthKey_*.p8
```

Keep a second copy in your password manager. If it's lost, create a new key and update every place that uses it.

Your **Team ID** (`ABCDE12345`) is at the top right of the developer portal, and under Membership details.

## Step 3: Check the key

*Who does this: Your AI agent (offline check), You + agent (real check)*

**Offline:** the script confirms the file is a P-256 private key, that the Key ID (from the file name) and Team ID
look right, and that it can sign a client secret:

```bash
APPLE_TEAM_ID=ABCDE12345 APPLE_KEY_PATH=~/.config/<app>/AuthKey_KEYID12345.p8 \
node scripts/check-apple-key.mjs com.example.app
```

> **Don't trust a fake authorization code.** Apple's token endpoint rejects the code *before* it checks your client
> secret. A made-up code gets `invalid_grant` back even with a garbage secret or a client ID that doesn't exist
> (tested October 2026), so it proves nothing. We made this mistake ourselves.

**Real proof** (any one of these):
- **With a fresh code:** in a dev build, call `appleAuthorizationCode()` (or log `credential.authorizationCode`). Then,
  within 5 minutes, run `node scripts/check-apple-key.mjs com.example.app --code <code>`. The script exchanges the
  code and revokes the token, which is exactly what account deletion does.
- **Web:** a real "Continue with Apple" on your web app works. Supabase exchanges a real code using the web secret,
  which is signed with the same key, so this proves the key, Key ID and Team ID.
- **iOS deletion:** your delete function's log shows `apple_token: revoked`.

## Step 4: Create a Services ID (only if you want Apple on the web)

*Who does this: You (console)*

1. **Identifiers → +** → **Services IDs** → Continue.
2. Description: `<App> web sign-in`. Identifier: `com.example.app.web` → Continue → Register.
3. Open `com.example.app.web` → tick **Sign In with Apple** → **Configure**:
   - Primary App ID: `com.example.app`
   - Domains and Subdomains: `YOUR_PROJECT_REF.supabase.co`
   - Return URLs: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
   - Next → Done → Continue → **Save**.

The domain is Supabase's, not yours. Apple redirects back to Supabase, and Supabase redirects back to your web app.

Next, your agent creates the web client secret: [04 Supabase, step 3](04-supabase.md#step-3-apple-provider).

## Step 5: Register your email domain with Apple's private relay

*Who does this: You (console)*

People who pick **Hide my email** get an `…@privaterelay.appleid.com` address. Apple only forwards mail to it from senders you registered.

1. **Services → Sign in with Apple for Email Communication → Configure.**
2. Add your **domain** (`example.com`) and the **from-address** your auth emails use (for example `hello@example.com`) → Register.
3. Your sending domain needs SPF and DKIM that pass. Supabase's built-in mailer won't do for this. Use custom SMTP: [appendix: auth emails](appendix-auth-emails.md).

If Apple shows a failed SPF check, add or fix the domain's SPF record, wait for DNS, and re-check.

## What goes where

| Value | Goes to |
|---|---|
| Team ID `ABCDE12345` | Edge function secret `APPLE_TEAM_ID`, scripts `APPLE_TEAM_ID` |
| Bundle ID `com.example.app` | Supabase Apple "Client IDs", secret `APPLE_BUNDLE_ID` |
| Key ID `KEYID12345` + `.p8` contents | Secrets `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_PRIVATE_KEY`; scripts read `APPLE_KEY_PATH` |
| Services ID `com.example.app.web` | Supabase Apple "Client IDs" (**first**), scripts `APPLE_SERVICES_ID` |

## Verify

- [ ] Identifiers → `com.example.app` shows Sign In with Apple enabled.
- [ ] `node scripts/check-apple-key.mjs com.example.app` passes the offline checks.
- [ ] One real proof from step 3 has passed: a `--code` run, a web sign-in, or `apple_token: revoked` in the delete log.
- [ ] The `.p8` is in two safe places and in no git repository: `git status` never shows it, and `*.p8` is in `.gitignore`.
- [ ] The private relay page lists your domain and from-address.
