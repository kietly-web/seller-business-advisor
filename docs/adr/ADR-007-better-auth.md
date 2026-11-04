# ADR-007 Better Auth, self-hosted in our database

Status: Accepted · 2026-11-04

## Context

FR-01 needs email sign-up with verification and Google sign-in. NFR-SEC asks for optional MFA. Every hosted auth vendor would be another sub-processor holding seller personal data outside Vietnam.

## Decision

Use Better Auth with its Drizzle adapter, storing users, sessions and accounts in the `auth` schema of our Neon database. Enable email + password with verification, Google OAuth, and the two-factor (TOTP) plugin.

## Consequences

- Seller identity data stays in the same database and region as everything else, and moves with it under ADR-002.
- We own the rate limiting, breached-password checks and session hygiene that a vendor would otherwise handle (see 03).
- Verification emails need an email provider (Q-I2).

## Alternatives considered

- Auth.js: no built-in MFA, and its credentials flow is discouraged.
- Clerk / Auth0: fast to set up, but a new sub-processor with identity data abroad, and cost as users grow.
- Neon Auth: convenient, but couples auth to Neon, against ADR-002.
