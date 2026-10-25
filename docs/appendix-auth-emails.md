# Appendix: auth emails that actually arrive (custom SMTP)

**What you'll have at the end:**
- Supabase Auth sends sign-up, reset and invite emails from your own domain through a real email provider, with SPF, DKIM and DMARC passing;
- a sensible rate limit and branded templates;
- your domain registered for Apple's private relay.

Resend is the example below. Any SMTP provider (Postmark, SES, Mailgun) works the same way.

## Why you need it

- **Supabase's built-in sender** is for development only. It's rate-limited across the **whole project** (a few emails an hour), so a group of testers signing up together hits "email rate limit exceeded".
- **Apple's private relay** (`@privaterelay.appleid.com`) only forwards mail from domains and addresses you registered, and only if the mail authenticates (SPF/DKIM). The built-in sender can't meet that.

## Step 1: Verify your domain with the provider

*Who does this: You (console)*

1. Resend → **Domains → Add domain** → `example.com`. Pick the region closest to your users.
2. Resend shows DNS records, usually:
   - a DKIM `TXT` at `resend._domainkey`;
   - sending records on a subdomain (Resend's newer setup uses `CNAME`s such as `send` and `rsend`; older setups use `MX` + `TXT` on `send`).
3. Add them at your DNS host. If you use Cloudflare, set every record to **DNS only (grey cloud)**. Many hosts offer one-click "Auto configure".
4. Click **Verify** in Resend.

These records live on their own names, so they **don't touch** your normal inbox's MX records. Mail to `hello@example.com` keeps going to Google Workspace or whoever hosts it.

## Step 2: Add SPF and DMARC for the root domain

*Who does this: You (console)*

| Type | Name | Content |
|---|---|---|
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` (list whoever sends as your root domain; this example is Google Workspace) |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:hello@example.com` |

- Resend doesn't need to be in the root SPF: it sends from its own subdomain, which has its own records.
- `p=none` only collects reports and never blocks mail. Tighten it later.

## Step 3: Check the provider works before switching Supabase

*Who does this: Your AI agent*

Check the API key over SMTP, then send one message to the provider's test inbox (Resend's is `delivered@resend.dev`, so no real person gets it):

```python
import os, smtplib
from email.message import EmailMessage
m = EmailMessage(); m['From'] = 'App <hello@example.com>'; m['To'] = 'delivered@resend.dev'
m['Subject'] = 'SMTP check'; m.set_content('Check from the auth setup.')
with smtplib.SMTP_SSL('smtp.resend.com', 465) as s:
    s.login('resend', os.environ['RESEND_API_KEY']); s.send_message(m)
```

A **send-only** API key is enough for SMTP.

**Never point Supabase at the provider before the domain shows Verified.** The provider rejects mail from an unverified domain, so every sign-up and reset email would fail.

## Step 4: Switch Supabase to your SMTP

*Who does this: Either*

Dashboard → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:

| Field | Resend value |
|---|---|
| Host / Port | `smtp.resend.com` / `465` |
| Username | `resend` |
| Password | your Resend API key |
| Sender email | `hello@example.com`. A real inbox beats `no-reply`, because people reply to auth emails asking for help. |
| Sender name | your app's name |

Then **Authentication → Rate Limits → Rate limit for sending emails**: raise it, for example to 100 per hour. This setting only applies once custom SMTP is on.

The same fields exist in the Management API (`PATCH /v1/projects/{ref}/config/auth`): `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email`, `smtp_sender_name`, `rate_limit_email_sent`.

## Step 5: Branded templates

*Who does this: Your AI agent*

**Authentication → Emails → Templates**, or the Management API fields `mailer_templates_<name>_content` and `mailer_subjects_<name>`, for `confirmation`, `recovery`, `invite`, `email_change` and `magic_link`.

Tips:
- Use tables and inline styles, no web fonts. Use hosted PNG logos, not SVG.
- Keep `{{ .ConfirmationURL }}` intact in the button **and** as a copy-paste fallback link.
- Say how long the link works (it matches `mailer_otp_exp`, 1 hour by default), and that people can ignore the email if they didn't ask for it.
- `{{ .Email }}` and `{{ .NewEmail }}` are available for the reset and email-change wording.

## Step 6: Register with Apple's private relay

*Who does this: You (console)*

Apple Developer → **Services → Sign in with Apple for Email Communication** → add `example.com` and `hello@example.com` ([03, step 5](03-apple-developer.md#step-5-register-your-email-domain-with-apples-private-relay)).

## Step 7: Your privacy policy

*Who does this: You + Your AI agent*

Your email provider now handles every user's email address. List it with your other processors, for example: "Resend (United States): sends account emails such as sign-up confirmation and password reset."

## Verify

- [ ] The provider shows the domain as **Verified**, and `dig TXT _dmarc.example.com` returns your policy.
- [ ] The SMTP test to the provider's test inbox succeeds.
- [ ] Supabase shows custom SMTP enabled and the raised rate limit.
- [ ] A real Forgot password test arrives in the **inbox**, not spam, and the link opens your reset page. That last part needs the [Redirect URLs](04-supabase.md#step-1-redirect-urls-do-this-first) to be right.
- [ ] In Gmail, ⋮ → **Show original** shows **PASS** for SPF, DKIM and DMARC.
- [ ] An Apple "Hide my email" account receives its emails.
