# ADR-009 Amazon SES (Singapore) for email; Have I Been Pwned range check for passwords

Status: Accepted · 2026-11-05 · Resolves Q-I2 (email provider)

## Context

SA-105 needs to send verification emails (and later the weekly digest, FR-15), and NFR-SEC asks for a breached-password check at sign-up (ASVS L2). Both are external services, so each is a sub-processor or data flow to disclose. The owner chose these on 05/11/2026.

## Decision

- **Email:** Amazon SES v2 in `ap-southeast-1` (Singapore), through `@aws-sdk/client-sesv2`, behind the `EmailSender` interface in `apps/web/server/email.ts`. Without SES configuration, local development logs messages to the console, and every other environment refuses to send (sign-up fails visibly instead of leaking links into logs).
- **Breached passwords:** Better Auth's `haveIBeenPwned` plugin on sign-up, password change and reset. Only the first 5 hex characters of the password's SHA-1 hash leave the server (k-anonymity range API); the password, its full hash and the user's email are never sent.
- **Google sign-in** is deferred until the owner creates an OAuth client; email + password + verification ships first.

## Consequences

- SES keeps seller email addresses in the same region as Neon and Vercel, so the privacy policy names no new country. Before real sign-ups: verify the sending domain, set up SPF/DKIM/DMARC, and request production access (leave the SES sandbox).
- Needs `AWS_SES_REGION`, `EMAIL_FROM` and AWS credentials (an IAM user or role limited to `ses:SendEmail` from that address) in Vercel.
- The HIBP call adds a network dependency at sign-up. If the service is unreachable, Better Auth rejects the request; we accept that over silently skipping the check.
- `apiv3.haveibeenpwned.com` does not receive personal data, so it is listed as a data flow, not a sub-processor.

## Alternatives considered

- Resend / Postmark: simpler setup, but US-based and one more country to disclose.
- Length-only password rules: no external call, but misses reused breached passwords.
