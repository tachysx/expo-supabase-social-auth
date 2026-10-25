# 2. Google Cloud: consent screen and OAuth clients

**What you'll have at the end:** a published Google consent screen and four OAuth clients:
- a Web client (with its secret);
- two Android clients, one for the Play signing key and one for your upload key;
- an iOS client.

Their IDs go into Supabase ([04](04-supabase.md)) and your app ([05](05-expo-app.md)).

> In 2025 Google renamed "APIs & Services → OAuth consent screen" to **Google Auth Platform**, with pages called Branding, Audience, Clients and Data access. If your console still shows the old names, the fields are the same.

## Step 1: Create the project

*Who does this: You (console)*

1. Go to **console.cloud.google.com**. Sign in with your organisation's Google account, not a personal Gmail, so the project belongs to the company.
2. Project picker → **New project** → name it after your app → Create.

## Step 2: Set up the consent screen

*Who does this: You (console)*

1. **Google Auth Platform → Get started.**
   - App name: your app's name.
   - User support email: a shared inbox, for example `support@example.com`.
   - Audience: **External**.
   - Contact email: the same inbox → Create.
2. **Branding:**
   - App home page: `https://example.com`
   - Privacy policy: `https://example.com/privacy`
   - Terms of service: `https://example.com/terms`
   - Authorized domains: add **your domain** and **`supabase.co`**. The web flow's redirect goes to `YOUR_PROJECT_REF.supabase.co`, so `supabase.co` must be listed.
   - **Skip the logo for now.** Uploading a logo triggers brand verification, which can take days. Add it later.
3. **Data access:** leave the default scopes (`openid`, `email`, `profile`). These are non-sensitive, so Google doesn't need to review the app.
4. **Audience → Publish app.** Status must say **In production**. In "Testing" mode only the test users you list can sign in.

## Step 3: Get your two Android SHA-1 fingerprints

*Who does this: Either*

Google ties an Android client to a package name plus a signing-certificate SHA-1. Play re-signs your app with its own key, so you need **two** fingerprints:

| Fingerprint | Used by | Where to get it |
|---|---|---|
| **Play app-signing key** | Installs from Google Play, including internal and closed testing | Play Console → your app → **Test and release → App integrity → App signing** → "App signing key certificate" → SHA-1 |
| **Upload key** (EAS keystore) | Builds you install directly, such as EAS internal-distribution APKs | Read it from any build EAS made: |

```bash
# Your AI agent can run this from your Expo app folder. It downloads your latest EAS Android build and prints its signer.
bash path/to/expo-supabase-social-auth/scripts/android-sha1.sh
# The same thing by hand:
npx eas-cli build:list --platform android --status finished --limit 1 --json --non-interactive
curl -L -o app.aab "<artifacts.buildUrl from the output above>"
keytool -printcert -jarfile app.aab | grep SHA1
```

If you can't see the App integrity page, ask the Play Console owner. Until then the upload-key client is enough for builds you install yourself.

## Step 4: Create the four clients

*Who does this: You (console)*

Go to **Google Auth Platform → Clients → Create client**, four times:

| # | Application type | Name | Fill in |
|---|---|---|---|
| a | **Web application** | `<App> web` | Authorized redirect URIs: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` |
| b | **Android** | `<App> Android (Play)` | Package `com.example.app` · SHA-1 of the Play app-signing key |
| c | **Android** | `<App> Android (upload)` | Package `com.example.app` · SHA-1 of the upload key |
| d | **iOS** | `<App> iOS` | Bundle ID `com.example.app` · Team ID `ABCDE12345` (optional) |

Notes:
- **You need the Web client even if you only ship native apps.** Your app passes the web client ID to the Google SDK as `webClientId`. That makes Google issue ID tokens for the client Supabase checks first.
- You don't need "Authorized JavaScript origins" on the web client. The browser goes through Supabase's callback, not Google's JavaScript library.
- After creating the web client, copy its **Client secret** (it starts with `GOCSPX-`). Treat it as a password.
- The iOS client also gives you an **iOS URL scheme**: the client ID reversed, `com.googleusercontent.apps.<numbers>-<hash>`. The Expo config plugin needs it. The template computes it from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

## Step 5: Hand the values over

*Who does this: You → Your AI agent*

Client IDs are not secrets. Paste them to your agent or put them in the env files:

```bash
# For the scripts (scripts/README.md)
GOOGLE_WEB_CLIENT_ID=123-web.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_IDS=123-play.apps.googleusercontent.com,123-upload.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=123-ios.apps.googleusercontent.com

# For the app (templates/expo/.env.example)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=123-web.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=123-ios.apps.googleusercontent.com
```

**Never paste the client secret into a chat.** Put it in a gitignored env file, for example `GOOGLE_WEB_CLIENT_SECRET=...` in `.env.local`, and let the agent read it from there.

## Verify

*Who does this: Your AI agent (after [04](04-supabase.md) is done)*

```bash
# Supabase should redirect to Google with your web client and the Supabase callback.
curl -s -o /dev/null -w "%{redirect_url}\n" \
  "https://YOUR_PROJECT_REF.supabase.co/auth/v1/authorize?provider=google&redirect_to=https://example.com/"
```

- [ ] The URL goes to `accounts.google.com` with `client_id=<your web client>` and `redirect_uri=https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
- [ ] Opening that URL shows Google's account picker, not an `Error 400: redirect_uri_mismatch` page.
- [ ] Google Auth Platform → Audience says **In production**.
- [ ] You have both Android clients, or a note that the Play one is pending.
