# Appendix: in-app purchases (RevenueCat): store setup traps

This repo is about sign-in, but the same release usually adds in-app purchases. These are the store-side traps we hit
shipping consumable credit packs (Apple IAP + Google Play Billing through RevenueCat) in the same Expo + Supabase app.
None of them is a code bug, and each one can cost you a day.

**What you'll have at the end:** products that actually load in TestFlight and Play testing, and a way to see what
the store answered when they don't.

## Apple

**1. The Paid Apps Agreement must be Active, and only the Account Holder can sign it.**
*Who does this: the Account Holder (App Store Connect → Business → Agreements)*
- Until it's **Active**, StoreKit returns no products at all, not even in sandbox or TestFlight. After signing, it
  stays "Pending" for up to about a day while Apple checks bank and tax details.
- Admins and App Managers can't sign it. Find out who your Account Holder is early.

**2. The first in-app purchases return nothing until they're attached to an app version.**
*Who does this: You (App Store Connect)*

Our products were "Ready to Submit" and the agreement was Active, and StoreKit still returned **zero products**. It
didn't error; it gave an empty list. The fix:

1. Open the app version you'll submit and select its build.
2. In **In-App Purchases and Subscriptions**, add the products and **Save**. You don't have to submit.
3. Within about 30 minutes, TestFlight loaded all three.

Apple's documentation says Ready to Submit products work in sandbox. In practice, an app's *first* products didn't
until they were attached to a version. They're reviewed with that version anyway, since an app's first IAP can't be
submitted on its own.

**3. Sandbox prices can show in USD.** In TestFlight, prices may come back in the sandbox account's currency (for
example $0.99) rather than the tester's local one (RM4.90). That's not a pricing bug.

## Google Play

**4. You can't create in-app products until a build with Play Billing is uploaded.** Upload an AAB that includes the
billing library (RevenueCat adds `com.android.vending.BILLING`) to a testing track first, even internal testing.

**5. One-time products now have "purchase options".**
- **Purchase option ID:** any lowercase ID, for example `buy`. It only has to be unique within that product.
- **Purchase type:** Buy.
- Under **Advanced options**, keep it **backwards compatible** so SDKs on older Play Billing Library versions can see
  it.

**6. RevenueCat needs a service-account JSON key, and new Google Cloud organisations block key creation.**
- The error says "Service account key creation is disabled", citing `iam.managed.disableServiceAccountKeyCreation`,
  which is on by default for organisations created since 2024.
- Fix: an Organisation Policy Administrator goes to the project → **IAM & Admin → Organisation Policies** → that
  policy → **Override parent's policy → Off**. You create the key, then they can switch the policy back on. Existing
  keys keep working.
- Invite the service account in Play Console → Users and permissions with **View app information**, **View financial
  data** and **Manage orders and subscriptions**. Google can take up to about 36 hours to accept new credentials.

**7. Licence testers.** Play Console home (account level) → Settings → **License testing** → add the testers' Gmail
addresses, so their test purchases aren't charged. They also need the testing track's opt-in link.

## Seeing what the store answered

"Products didn't load" can mean the device, the store account, the store's answer, or your code. Make the error say
which. RevenueCat exposes enough for this. Only show it in test builds:

```ts
import Purchases, { LOG_LEVEL } from 'react-native-purchases'

const recentLogs: string[] = []
Purchases.setLogLevel(LOG_LEVEL.DEBUG)
Purchases.setLogHandler((level, message) => {
  recentLogs.push(`${level}: ${message}`)
  if (recentLogs.length > 40) recentLogs.shift()
})

export async function storeDiagnostics() {
  const storefront = await Purchases.getStorefront().catch(() => null)
  const canPay = await Purchases.canMakePayments().catch(() => null)
  return [
    `Store: ${storefront?.countryCode ?? 'unknown'}`,
    `Payments: ${canPay === null ? 'unknown' : canPay ? 'allowed' : 'not allowed'}`,
    ...recentLogs.filter(l => /product|storekit|error|warn/i.test(l)).slice(-4),
  ].join('\n')
}
```

How to read it:
- **Store unknown, or payments not allowed:** a device or account problem, such as Screen Time purchase limits or the
  account's region.
- **"Store products request received response" but no products:** the store answered and has nothing for you. Look at
  traps 1 and 2 (Apple) or 4–5 (Play).
- **A StoreKit or Billing error:** a real error. Read it.

## Consumables with RevenueCat: two notes
- For consumable packs you don't need RevenueCat entitlements or offerings. `Purchases.getProducts(ids,
  PRODUCT_CATEGORY.NON_SUBSCRIPTION)` asks the store directly, and your server can own the list of product IDs and
  how many credits each is worth.
- Grant credits on the server from RevenueCat's webhook (`NON_RENEWING_PURCHASE`; take back on `CANCELLATION`).
  Make it idempotent on the store transaction ID, because RevenueCat retries.

## Verify
- [ ] App Store Connect → Agreements shows **Paid Apps: Active**.
- [ ] The products are attached to the version you'll submit.
- [ ] TestFlight shows every pack with a price. If it doesn't, the diagnostics line tells you which trap it is.
- [ ] Play: the AAB with billing is on a testing track, the products are **Active**, and the testers are licence
  testers.
- [ ] A sandbox or test purchase reaches your webhook and is credited once.
