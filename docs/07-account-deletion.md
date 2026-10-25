# 7. Account deletion: revoke Apple, delete logins without a profile

**What you'll have at the end:**
- an account delete that also revokes the user's Sign in with Apple token, as Apple requires;
- deletion that works even for someone who signed in but never finished onboarding.

## Why

- **App Store guideline 5.1.1(v):** apps that offer account creation must offer in-app deletion. Apple's Sign in with Apple rules add that deleting the account must **revoke the user's token** through Apple's REST API. Otherwise your app keeps showing as connected under the user's Apple ID → Sign in with Apple.
- **Social sign-in creates a login before any profile row exists.** If your delete endpoint returns "user not found" when there's no profile, someone who quits onboarding can never delete their account.

## How revocation works

```
App (iOS)    ──► Apple sheet again, no scopes ──► fresh authorizationCode
App          ──► DELETE /functions/v1/delete-account  { appleAuthorizationCode }
Function     ──► POST https://appleid.apple.com/auth/token   (code + ES256 client secret) ──► refresh_token
Function     ──► POST https://appleid.apple.com/auth/revoke  (refresh_token)               ──► 200
Function     ──► delete app data ──► supabase.auth.admin.deleteUser(id)
```

- The client secret is a JWT signed with your `.p8`:
  - header `alg ES256`, `kid` = Key ID;
  - claims `iss` = Team ID, `aud` = `https://appleid.apple.com`, `sub` = bundle ID, valid for 5 minutes.
- Web Crypto signs ECDSA in the raw `r||s` form that JWTs use, so no library is needed.
- Asking Apple again at delete time means you never store Apple refresh tokens.

## Step 1: Add the shared module and its test

*Who does this: Your AI agent*

Copy `templates/supabase/functions/_shared/apple-signin.ts` and `apple-signin.test.ts` into `supabase/functions/_shared/`.

```ts
appleClientSecret({ teamId, clientId, keyId, privateKey }, now?)    // → JWT
revokeAppleSignIn(code, { teamId, clientId, keyId, privateKey })    // throws with Apple's error
```

```bash
npx -y deno test supabase/functions/_shared/apple-signin.test.ts
```

The tests:
- sign with a throwaway P-256 key and verify the signature and claims;
- stub `fetch` to check that the code exchange happens before the revoke;
- check that a rejected code never reaches the revoke call.

## Step 2: The delete function

*Who does this: Your AI agent*

Start from `templates/supabase/functions/delete-account/index.ts`. It:

1. Authenticates the caller from the `Authorization: Bearer <access token>` header, and returns 401 without one.
2. Reads `appleAuthorizationCode` from the JSON body, if sent, and calls `revokeAppleSignIn`.
   - **A failed revoke never blocks the deletion.** It's logged and recorded (`apple_token: revoked | error | not-configured | not-requested`).
   - Blocking would leave the user unable to delete their data.
3. Deletes your app's rows. **Edit this part for your schema.** Delete rows whose foreign keys don't cascade first, and stop with a 500 if one fails, while the login still exists so the user can retry.
4. If there's **no profile row**, skips straight to step 5.
5. Calls `admin.auth.admin.deleteUser(user.id)` last.

Deploy it with the secrets from [04, step 5](04-supabase.md#step-5-edge-function-secrets-for-account-deletion):

```bash
# templates/supabase/config.toml.example: verify_jwt = false because the function checks the token itself
npx supabase functions deploy delete-account --project-ref YOUR_PROJECT_REF
```

If you run a server copy of the same endpoint (say a Next.js route), mirror the change there too.

## Step 3: The app side

*Who does this: Your AI agent*

```ts
let appleCode: string | null = null
const providers = (session.user.app_metadata?.providers as string[] | undefined) ?? []
// Only the iOS app can ask Apple again; on Android and the web, delete without it.
if (Platform.OS === 'ios' && providers.includes('apple')) {
  appleCode = await appleAuthorizationCode()            // from socialAuth.ts
  if (!appleCode) return setError('Confirm with Apple to delete your account.')
}
await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  body: appleCode ? JSON.stringify({ appleAuthorizationCode: appleCode }) : undefined,
})
await signOut()
```

Use `Platform.OS === 'ios'` here, not `appleSignInAvailable`. That flag is also `true` on the web, where there's no native sheet to ask again, and using it would block web users from deleting.

## Verify

*Who does this: Your AI agent (steps 1–3), You on an iPhone (step 4)*

1. **Unit tests:** `deno test …/apple-signin.test.ts` passes.
2. **Key setup:** `node scripts/check-apple-key.mjs` passes offline. The real proof is step 4's log line, or a `--code` run ([03](03-apple-developer.md#step-3-check-the-key)).
3. **Deleting a login with no profile, on production, with a throwaway user:**
   ```bash
   # create a confirmed user with the admin API (no email is sent), sign in for a token, then:
   curl -s -X DELETE "$SUPABASE_URL/functions/v1/delete-account" -H "Authorization: Bearer $TOKEN" -H "apikey: $ANON_KEY"
   # → {"success":true,...}; GET /auth/v1/admin/users/<id> now returns 404
   ```
4. **On an iPhone:**
   - Create an account with Apple, then delete it in the app.
   - Apple should ask you to confirm.
   - The function log should show `apple_token: 'revoked'`.
   - Settings → Apple ID → Sign in with Apple should no longer list your app.

- [ ] A delete without a token returns 401.
- [ ] A user with no profile is deleted, and the login is gone.
- [ ] An Apple user's token is revoked: the log says `revoked`, and the app is gone from the Apple ID settings.
