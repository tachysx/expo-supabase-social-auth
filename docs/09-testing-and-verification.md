# 9. Testing and verification

**What you'll have at the end:** proof, not hope. Every part is checked:
- the console settings, with scripts that need no real sign-in;
- the build, by its entitlements;
- the flows, on devices and the web;
- the database, so you know identities were linked and consent saved.

This is the test list we ran before shipping.

## Part A: Checks that need no human

*Who does this: Your AI agent*

| What | Command | Pass |
|---|---|---|
| Apple key file, Key ID, Team ID | `APPLE_TEAM_ID=… APPLE_KEY_PATH=… node scripts/check-apple-key.mjs com.example.app` | offline checks pass |
| Return addresses honoured | `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… TEST_EMAIL=… node scripts/check-redirects.mjs myapp://auth/callback https://app.example.com/` | each address comes back unchanged |
| Providers wired | `curl …/auth/v1/authorize?provider=google\|apple&redirect_to=…` | right host and client ID (see [04](04-supabase.md#verify)) |
| Revoke code | `deno test supabase/functions/_shared/apple-signin.test.ts` | all pass |
| Delete with no profile | throwaway user, `DELETE /functions/v1/delete-account` | `success: true`, then the admin `GET` of the user returns 404 |
| Web bundle clean | grep the `expo export -p web` entry file for `RNGoogleSignin` | 0 |
| Type check | `npx tsc --noEmit` | exit 0 |

No automated check can prove the Apple key with Apple: a fake code gets `invalid_grant` whatever the secret. The proof comes from a real sign-in (Part C): a web "Continue with Apple", an iOS deletion that logs `apple_token: revoked`, or `check-apple-key.mjs --code` with a fresh code.

## Part B: Check the iOS build itself

*Who does this: Your AI agent*

Before installing a build, make sure it carries the capability and the Google URL scheme:

```bash
bash scripts/check-ios-entitlements.sh <EAS build ID>     # or a path to an .ipa
# by hand:
unzip -q app.ipa -d x && APP=$(ls -d x/Payload/*.app)
codesign -d --entitlements :- "$APP" | plutil -convert json -o - - | grep applesignin
/usr/libexec/PlistBuddy -c "Print :CFBundleURLTypes" "$APP/Info.plist" | grep googleusercontent
```

Expect `"com.apple.developer.applesignin": ["Default"]` and `com.googleusercontent.apps.<your iOS client>`. If the entitlement is missing, the build used an old provisioning profile ([10](10-shipping-builds.md)).

## Part C: Flows to click through

*Who does this: You (devices and browser)*

Run these on the web preview ([08](08-web-app.md)) and on the store builds:

| # | Scenario | Expected |
|---|---|---|
| 1 | Existing **email** account → Continue with **Google**, same address | Lands in the existing account. No consent step, no onboarding. |
| 2 | Same account → Continue with **Apple**, sharing the real email | Same account again |
| 3 | **New** Google account | Consent step → onboarding with the first name filled in → home |
| 4 | **New** Apple ID with **Hide my email** | New account with a `@privaterelay.appleid.com` email; consent → onboarding; Skip is offered on the name step |
| 5 | Sign out → Continue with Google | The Google account picker appears again |
| 6 | Delete the account from step 3 (web or Android) | Account deleted, signed out |
| 7 | Delete an Apple account (iPhone) | Apple asks to confirm; log shows `apple_token: revoked` |
| 8 | Cancel the Apple or Google sheet | Back on sign-in, no error message |
| 9 | Password reset for an email account | The link opens your reset page, not the Site URL |

## Part D: Check the database after the clicks

*Who does this: Your AI agent*

```sql
-- After scenarios 1–2: one user with three identities
select u.email,
  count(*) filter (where i.provider = 'email')  as email,
  count(*) filter (where i.provider = 'google') as google,
  count(*) filter (where i.provider = 'apple')  as apple,
  (select count(*) from auth.users x where lower(x.email) = lower(u.email)) as accounts_with_this_email
from auth.users u join auth.identities i on i.user_id = u.id
where lower(u.email) = 'you@example.com' group by u.id, u.email;
-- expect: email 1, google 1, apple 1, accounts_with_this_email 1

-- After scenario 3: consent saved for the new social account
-- (see the query in doc 06)

-- After scenarios 6–7: nothing left
select (select count(*) from auth.users where lower(email) = 'new-tester@example.com') as logins,
       (select count(*) from public.profiles where lower(email) = 'new-tester@example.com') as profiles;
-- expect: 0, 0
```

## Verify

- [ ] Every Part A row passes.
- [ ] The build has the `applesignin` entitlement and the Google URL scheme.
- [ ] Scenarios 1–9 behave as expected on the web, iOS and Android (Apple only on the web and iOS).
- [ ] The database shows linked identities, saved consent, and clean deletes.
