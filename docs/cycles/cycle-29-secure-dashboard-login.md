# Cycle 29 - Secure Dashboard Login Before Seller Phone Use

## Operator result

The dashboard starts locked. It unlocks only after `/api/auth/login` accepts the
server-configured admin PIN. A browser-stored value, an API timeout, or an API
failure cannot fabricate an admin session or reveal the deal-board snapshot.

This cycle changes authentication only. It does not change seller-phone evidence,
source acquisition, property identity, comp rules, readiness, or saved leads.

## Three doors closed

1. Newly seeded users have no usable PIN, and historical seeded defaults cannot
   authenticate.
2. The browser has no local PIN fallback and begins with an unauthenticated identity.
3. User-list and user-write routes require server-side authorization. A non-admin
   first-login user may only set their own name and PIN and clear their own
   `firstLogin` flag; they cannot alter another user or elevate their role.

## Release order and rollback

1. Before merge, set `WOS_ADMIN_PIN` in Railway without printing or copying it into
   a log, screenshot, issue, PR, or repository file.
2. Confirm the current deployed dashboard remains accessible while the old release
   is still serving. The old release does not consume the new variable.
3. Merge and wait for the new Railway deployment.
4. Immediately verify that the configured PIN authenticates and that an incorrect
   PIN does not. Do not test with seller-phone data or write an operator outcome.
5. If the configured PIN cannot authenticate, revert the Cycle 29 merge commit.
   Leaving `WOS_ADMIN_PIN` set is harmless to the reverted release.

There are deliberately no sessions, expiring tokens, or PIN hashing in this bounded
cycle. Requests still identify the user with `x-user-id` after browser login. Session
expiry, signed cookies/tokens, rate limiting, and secret hashing are the next security
layer and must receive a separate design and QA pass.

## Read-only preflight

Run `node scripts/cycle-29-login-preflight.js <local-db-copy>` against a local copy.
It never contacts production, writes the database, or prints a PIN. If no local copy
exists, the honest result is `UNREACHABLE`.
