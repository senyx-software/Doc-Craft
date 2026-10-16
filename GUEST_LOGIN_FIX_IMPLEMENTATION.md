# Guest connection fixes

Verified locally on 2026-10-14. The reported symptom was a button remaining on **Connecting as Guest…**.

## Findings and changes

- Guest login used an unbounded browser fetch. A stalled request never rejected, leaving both the auth store and button busy. Guest requests now send an explicit JSON body and have a 20-second timeout. Timeout errors restore the button and show a retry message. Profile initialization also has a 15-second timeout.
- Guest responses advertised 24 hours, but the JWT used the ordinary access-token lifetime (15 minutes in the current configuration). Guest JWTs now expire at the exact 24-hour timestamp returned in `expires_at`; normal account-token settings remain in use for other sign-ins.
- Refresh restored the profile with `isGuest: false`. It now restores guest status, identity and session expiration from the verified profile/token.
- An older profile response or HTTP 401 could clear a newer login. Token comparisons now fence those callbacks so they cannot overwrite or log out a newly connected guest.
- Invalid token strings no longer count as valid sessions. The guest response is checked before storing authentication state.
- Guest account creation now requires a persisted identity. Database failure returns a recoverable 503 instead of signing a token for an unmatched in-memory fallback identity.
- Guest redirect preserves the requested builder query string. `guest` is represented explicitly in the frontend authentication-provider type.

A fresh native guest login worked during the initial browser audit. The stalled-request symptom was reproduced deliberately through browser request interception; its underlying cause in the user's browser was not available. The fixes cover timeout recovery and the verified session-lifetime/restoration/race problems.

## Files

- `services/auth/src/controllers/auth.controller.ts`, `src/services/jwt.service.ts`, and new `src/controllers/guestLogin.test.ts`.
- `user-frontend/src/api/client.ts`, `src/api/auth.ts`, `src/store/authStore.ts`, `src/types/index.ts`, and `src/middleware/GuestRoute.tsx`.
- New frontend `src/store/__tests__/guestAuth.test.ts` and `src/api/__tests__/guest.test.ts`.

## Verification

- Auth suite: **20 tests passed** across three files.
- Shared/chat/gateway/frontend regression suite: **151 shared tests plus 148 Vitest tests passed** (299 total).
- Auth and frontend production builds passed; the existing frontend bundle-size warning remains. `git diff --check` passed.
- A real browser intercepted and held the guest POST: after 20 seconds the timeout message appeared and **Continue as Guest** became enabled again.
- A real guest sign-in then opened the builder, verified matching 24-hour JWT/response expiration, retained guest status after refresh, created an invoice session and saved `nexora` as `Nexora` through the native gateway/chat/database workflow.
- Browser result: `/tmp/doccraft-guest-browser-result.json`. Screenshot: `/tmp/doccraft-guest-verified.png`. Logs: `/tmp/doccraft-guest-browser-verify.log`.

Refresh the login page to discard a request that was already stuck before this change, then use **Continue as Guest**. New guest requests require the auth service and database to be available; failures now terminate with an actionable error rather than an indefinite spinner.
