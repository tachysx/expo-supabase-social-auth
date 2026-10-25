# 6. Consent and onboarding for social sign-ups

**What you'll have at the end:**
- new Apple and Google users agree to your terms and data-processing consents before you collect anything sensitive;
- their first name is filled in for them;
- Apple users are never forced to retype a name.

Existing users who add Google or Apple to their account see none of this.

## Why this step exists

With email sign-up, your form usually shows the consent checkboxes (terms, privacy policy, and any data consent your law requires: GDPR, Malaysia's PDPA, and so on). Social sign-up **skips that form**. One tap creates the account. Without this step, those users never consent, and if onboarding asks something sensitive (health, religion, mood), you'd collect it with no consent on record.

## Step 1: Decide when to ask

*Who does this: Your AI agent*

Show consent as the **first onboarding step** when **both** are true:
1. The profile has no consent at your current version, for example `profile.consent_version !== CONSENT_VERSION`. A new social user has no profile at all.
2. The device holds no pending consent for this email. That's the case for email sign-ups that ticked the boxes before their profile row existed.

```ts
const consented =
  profile?.consent_version === CONSENT_VERSION ||
  (await hasPendingConsent(session.user.email))          // same storage the email form uses
const steps = consented ? BASE_STEPS : ['consent', ...BASE_STEPS]
```

This also covers someone who signed up by email on another device and finishes onboarding on this one. They're asked again, which is the right outcome.

## Step 2: Store it exactly like the email path

*Who does this: Your AI agent*

Reuse the email form's storage instead of building a second path:

```ts
// When the user taps "Agree and continue" (all boxes ticked):
await savePendingConsent(session.user.email ?? '')   // timestamps + consent version, kept on the device
next()
// After onboarding creates the profile row (same call the email path makes):
await flushPendingConsent(accessToken)                 // POST to your consent endpoint
```

Keeping consent on the device until the profile exists means a sign-up that fails halfway never leaves consent timestamps behind for the next person who signs in on that phone.

Give the step a way out: a **Sign out** button for people who don't agree. Don't leave them stuck.

Put the consent step **before** any question that collects sensitive data.

## Step 3: Fill in the name

*Who does this: Your AI agent*

```ts
function suggestedNickname(user) {
  const meta = user?.user_metadata ?? {}
  const given = typeof meta.given_name === 'string' ? meta.given_name : ''
  const full = typeof meta.full_name === 'string' ? meta.full_name : (typeof meta.name === 'string' ? meta.name : '')
  return (given || full.split(' ')[0] || '').trim().slice(0, 40)
}
setName(profile?.name || suggestedNickname(session.user))
```

- **Google:** Supabase copies `full_name` and `name` into `user_metadata` automatically.
- **Apple:** Apple puts no name in the token, and sends it only on the first authorization. The template saves it with `updateUser({ data: { full_name, given_name } })` straight after sign-in ([05](05-expo-app.md)).

## Step 4: Never force Apple users to retype

*Who does this: Your AI agent*

App Review rejects apps that **require** a name or email after Sign in with Apple, because Apple already provided them (or the user chose not to share). So:

- Prefill the name (step 3) and let the user edit it.
- If the user signed in with Apple, show a **Skip** option on the name step:
  ```ts
  const signedInWithApple = (session.user.app_metadata?.providers ?? []).includes('apple')
  ```
- Make sure your app copes with an empty name, for example "Hi there" instead of "Hi ,".
- Never ask Apple users for an email address. Supabase already has one: the real address or a relay one.

## Step 5: Your privacy policy

*Who does this: You (console) + Your AI agent*

Add a line like:

> If you sign in with Apple or Google, they share your name and email address with us (Apple can share a private relay address instead). We never see your Apple or Google password.

If your policy lists processors, add your email provider when you switch to custom SMTP ([appendix](appendix-auth-emails.md)).

## Verify

*Who does this: You (on a device or the web) + Your AI agent (database check)*

1. Sign in with a **Google account that has never used your app**.
2. You should see the consent step first, then onboarding with your first name filled in.
3. Finish onboarding, then check the database:

```sql
select p.consent_version, p.terms_consent_at is not null as terms, a.raw_app_meta_data->'providers' as providers
from auth.users a join public.profiles p on p.auth_user_id = a.id
where a.email = 'new-tester@example.com';
```

Expect your current consent version, every consent timestamp set, and `providers = ["google"]`.

- [ ] A new social account sees consent before any sensitive question.
- [ ] An existing email account that signs in with Google sees no consent step and goes straight home.
- [ ] Apple users can skip the name step, and the app handles an empty name.
