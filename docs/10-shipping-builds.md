# 10. Shipping builds and passing review

**What you'll have at the end:** iOS and Android store builds with both sign-ins, no crashes in older builds, and review notes that head off the usual Sign in with Apple rejections.

## Step 1: The first iOS build after turning on Sign in with Apple

*Who does this: You (your own terminal)*

Enabling the capability on the App ID **invalidates your provisioning profiles**. EAS has to sync capabilities and make a new profile, and that needs Apple access:
- **Either** run the build interactively once, with your Apple ID and 2FA;
- **or** give EAS an App Store Connect API key with the right role.

Run this in your own terminal, not through an agent's non-interactive shell:

```bash
cd your-app && npx eas-cli build -p ios --profile production --auto-submit
```

When EAS asks:
- **Log in to your Apple account?** → yes.
- **Sync capabilities or create a new provisioning profile?** → yes.
- **Reuse the existing distribution certificate?** → yes.

If you build non-interactively with the old profile, Xcode fails at code signing after the build has waited in the queue. Later builds can run non-interactively again.

## Step 2: Check the build before testers get it

*Who does this: Your AI agent*

```bash
bash scripts/check-ios-entitlements.sh <EAS build ID>
```

It must show `com.apple.developer.applesignin` and your `com.googleusercontent.apps.…` URL scheme ([09, part B](09-testing-and-verification.md#part-b-check-the-ios-build-itself)).

If `--auto-submit` didn't attach a submission (check `eas build:view <id> --json` → `submissions`), submit it yourself:

```bash
npx eas-cli submit -p ios --id <build-id> --non-interactive
```

## Step 3: Android

*Who does this: Your AI agent (build), You (Play Console)*

- Install through Google Play (internal testing is fine) to test Google sign-in with the **Play app-signing** client. An APK you install directly uses the **upload-key** client.
- If Google sign-in fails with `DEVELOPER_ERROR`, or silently returns nothing, a SHA-1 is wrong or missing. Compare both fingerprints with your two Android clients ([02, step 3](02-google-cloud.md#step-3-get-your-two-android-sha-1-fingerprints)).

## Step 4: Over-the-air updates won't carry this change

*Who does this: Your AI agent*

The Apple and Google SDKs are **native modules**. A JS bundle that imports them **crashes on launch** in any build that lacks them.

- With `runtimeVersion: { policy: 'appVersion' }`, builds that share a version also share a runtime. An `eas update` to that runtime reaches old builds too.
- **Ship the sign-in in a new store build.** Then either bump the app version, or make sure no OTA update goes to the older build's runtime.
- Mark old builds clearly in your release notes, for example: "Never OTA to build 3: it lacks the sign-in modules."

## Step 5: App Review checklist (iOS)

*Who does this: You (App Store Connect)*

| Rule | What to do |
|---|---|
| **4.8 Login Services:** offering Google on iOS requires Sign in with Apple, or an equivalent | Offer Apple on iOS whenever Google is there |
| **Button prominence:** Apple must be at least as prominent | Apple first, same size, Apple's own button on iOS |
| **Don't ask again:** apps that make users type their name or email after Sign in with Apple get rejected | Prefill the name and make it optional for Apple users ([06](06-consent-and-onboarding.md)) |
| **5.1.1(v) Account deletion:** in-app deletion that revokes the Apple token | [07](07-account-deletion.md) |
| **Review notes** | Say the app offers Sign in with Apple and Google, give a demo email account anyway, and say where deletion is (e.g. Profile → Account → Delete account) |

App Privacy: name, email and user ID are usually declared already. Social sign-in doesn't add new data types.

## Step 6: Google Play

*Who does this: You (Play Console)*

- **Data safety:** name and email address, for account management. Usually already declared.
- Nothing else changes for Google sign-in.

## Verify

- [ ] The first post-capability iOS build was made interactively, or with an App Store Connect API key, and the IPA shows the `applesignin` entitlement.
- [ ] TestFlight and Play internal builds pass every scenario in [09, part C](09-testing-and-verification.md#part-c-flows-to-click-through).
- [ ] No OTA update was sent to a runtime whose builds lack the native modules.
- [ ] The review notes mention both sign-ins, a demo account, and where account deletion is.
