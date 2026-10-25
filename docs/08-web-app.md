# 8. The web app: Google and Apple through Supabase's redirect

**What you'll have at the end:** Apple and Google sign-in on your react-native-web build, a way to test it on a preview deploy before it goes live, and a reminder system for Apple's 6-month web secret.

## How it differs from native

- No native SDKs. `socialAuth.web.ts` calls `supabase.auth.signInWithOAuth`, and the browser goes to Apple or Google, then to Supabase's callback, then back to `redirectTo` with the session in the URL hash.
- **Google** reuses the Web client from [02](02-google-cloud.md). Nothing extra is needed.
- **Apple** needs:
  - the **Services ID** `com.example.app.web` ([03, step 4](03-apple-developer.md#step-4-create-a-services-id-only-if-you-want-apple-on-the-web));
  - Supabase's Apple Client IDs listing it **first**;
  - a **client secret** that Apple caps at 6 months ([04, step 3](04-supabase.md#step-3-apple-provider)).

## Step 1: Turn on Apple for the web

*Who does this: Your AI agent*

In `templates/expo/lib/socialAuth.web.ts` both providers go through one helper:

```ts
export const appleSignInAvailable = true
export const googleSignInAvailable = true
async function redirectTo(provider: 'apple' | 'google') {
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })
  if (error) return { status: 'failed', message: error.message } as const
  return new Promise<never>(() => {})        // the page is leaving
}
```

Want Google only on the web? Set `appleSignInAvailable = false` and skip the Services ID.

The buttons on the web come from `SocialSignIn.tsx`'s web branch ([05, step 4](05-expo-app.md#step-4-the-buttons)).

## Step 2: Make sure the return address is allowed

*Who does this: Either*

`window.location.origin` must match an entry in **Authentication → URL Configuration → Redirect URLs**, such as `https://app.example.com/**`. If it doesn't, Supabase sends the user to the Site URL and the session hash ends up on your marketing page.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TEST_EMAIL=test@example.com \
node scripts/check-redirects.mjs https://app.example.com/       # must come back unchanged
```

## Step 3: Test on a preview deploy before going live

*Who does this: Your AI agent (deploy + allow list), You (clicking through)*

Test the exact build on a preview URL first, so production stays untouched:

1. **Build the web bundle from your branch:**
   ```bash
   npx expo export -p web --output-dir dist
   ```
2. **Deploy to a stable preview address**, not a random one, so it can go on the allow list. For example, on Netlify:
   ```bash
   npx netlify deploy --dir=dist --alias social-signin --site <site-id>
   # → https://social-signin--<site-name>.netlify.app
   ```
   Vercel and Cloudflare Pages have similar branch aliases.
3. **Allow that exact origin temporarily:**
   ```bash
   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=YOUR_PROJECT_REF \
   REDIRECT_URLS="https://social-signin--<site-name>.netlify.app/**" node scripts/configure-supabase-auth.mjs --apply
   ```
4. **Test** (the full list is in [09](09-testing-and-verification.md)):
   - an existing email account signing in with Google, and with Apple;
   - a brand-new account, which should see the consent step;
   - deleting the new account.
5. **After the merge:**
   - publish the same bundle to production. Compare the `entry-<hash>.js` filenames to prove it's byte-identical to what you tested.
   - **Remove the preview origin** from the Redirect URLs (dashboard → Authentication → URL Configuration).

## Step 4: Apple's 6-month secret

*Who does this: Your AI agent (script), You (calendar)*

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=YOUR_PROJECT_REF \
APPLE_TEAM_ID=ABCDE12345 APPLE_BUNDLE_ID=com.example.app APPLE_SERVICES_ID=com.example.app.web \
APPLE_KEY_PATH=~/.config/<app>/AuthKey_KEYID12345.p8 node scripts/apple-web-secret.mjs
# → Web secret set; it expires YYYY-MM-DD. Run this again before then.
```

- Add a recurring calendar event about 2 weeks before the printed date.
- Note the date in your release doc or task list too.
- If it expires, **only Apple on the web stops working**. Apple and Google in the native apps, and Google on the web, are unaffected.

Supabase never returns the stored secret through the API, and a fake-code request to Apple can't validate it ([03, step 3](03-apple-developer.md#step-3-check-the-key)). The proof is a real "Continue with Apple" on the web app: if it signs you in, the secret works.

## Step 5: Account deletion on the web

*Who does this: Your AI agent*

The web can't ask Apple again, so web deletes go through without `appleAuthorizationCode`. The function records `apple_token: not-requested`. This is why the app checks `Platform.OS === 'ios'`, not `appleSignInAvailable` ([07](07-account-deletion.md)).

## Verify

```bash
for p in google apple; do
  curl -s -o /dev/null -w "$p: %{redirect_url}\n" \
    "https://YOUR_PROJECT_REF.supabase.co/auth/v1/authorize?provider=$p&redirect_to=https://app.example.com/"
done
```

- [ ] Google → `accounts.google.com` with your web client. Apple → `appleid.apple.com` with `client_id=com.example.app.web`.
- [ ] On the preview deploy you end up back on the preview site, signed in, not on your Site URL.
- [ ] Production serves the same `entry-<hash>.js` you tested.
- [ ] The preview origin is gone from the Redirect URLs.
- [ ] The Apple secret's expiry date is in a calendar.
