# Surface contract probing

**Added:** 2026-07-29 · **Script:** `scripts/probe-surfaces.mjs` · **Run:** `npm run probe:surfaces -- --base-url <url>`

## Why this exists

The Better Auth catch-all route (`/api/auth/*`) returned 404 for months. Every
Better Auth endpoint — sign-in, get-session, sign-out, OAuth callbacks — was
unreachable in every deployed environment, while 2,151 unit tests passed and
the E2E suite stayed green.

The cause: `remix-flat-routes` treats `[brackets]` as a **literal escape**, so
`[...all].route.tsx` registered as the literal URL `/api/auth/...all`. Nothing
caught it because:

- **Unit tests import route handlers directly.** They never exercise routing,
  so a handler can be perfect and permanently unreachable.
- **E2E covers user journeys, not surface breadth.** The browser sign-in form
  posts to `/signin` (a page action), not the API catch-all, so the broken
  endpoints were never touched.
- **The static gates compare lists to lists.** `tools:api:surface:check` and
  `tools:routes:verify` both agreed the route existed — because the *registered*
  path and the *inventory* path matched each other. Both were wrong together.

The missing check was the obvious one: **ask the running server.**

## What it asserts

For every operation in `API_SURFACE` (191 probes across 144 entries), with **no
credentials**:

1. **Reachability.** React Router's unmatched-route 404 renders the app's HTML
   404 *document*; a matched route returns JSON/XML. An HTML body on an `/api/`
   path therefore means "no route matched" — this is the check that catches the
   dead-route class. Validated: `GET /api/definitely-not-a-route` → 404
   `text/html` containing `404 — CallCaster`.
2. **Declared auth**, per `authClass`:
   - `twilioSignature` / `stripeSignature` → 403 (strict mode only, see below)
   - `session` / `apiKeyOrSession` / `workspaceAdmin` → 401, 403, redirect to
     `/signin`, or 404 (non-members are deliberately shown 404 to hide existence)
   - `publicForm` → anything except 401
   - `internalTrusted` → mixed by design; reachability + no 5xx is the invariant
   - `weakUnknown` → always a failure; that class must not ship
3. **No 5xx** anywhere, and **no 405** (a 405 means the inventory's declared
   method disagrees with the route — real drift).

`410` passes as a deliberately retired endpoint.

## Strict vs relaxed provider auth

The compose E2E harness sets `TWILIO_VALIDATE_WEBHOOKS=false`,
`E2E_DISABLE_2FA_ENFORCEMENT=1`, and `E2E_DISABLE_AUTH_RATE_LIMIT=1` — so **E2E
structurally cannot verify those three declared behaviors.** Consequently:

| Where | Mode | Wired in |
|---|---|---|
| compose E2E (CI) | relaxed — reachability + non-provider auth | `scripts/e2e/run-compose-e2e.mjs`, after `waitForReady`, before Playwright |
| any deployed env | `--strict-provider-auth` — also requires unsigned webhooks to 403 | run manually / as a WS-D release gate |

Run against a deployed environment before every production release:

```bash
npm run probe:surfaces -- --base-url https://callcaster.ca --strict-provider-auth
```

Result on deployed dev, 2026-07-29: **191/191 OK**.

## Maintenance

- **Params**: `PARAM_VALUES` maps param names to seeded E2E ids
  (`scripts/e2e/seed-data.mjs`). Param names are not globally unique — `:id` is
  a workspace UUID on page routes but a numeric outreach-attempt id on
  `/api/outreach_attempts/:id` — so use `PATH_PARAM_OVERRIDES` for those.
- **Exceptions**: `EXPECTED_EXCEPTIONS` holds responses that are correct despite
  failing the generic rule (currently only idempotent sign-out returning 200).
  Every entry carries a reason. Do not add one to silence a finding you have not
  explained.

## Known gaps (not yet covered)

- **Page routes.** The `--include-pages` flag is declared but not implemented;
  69 page routes are unprobed. Worth adding: assert protected pages 302 to
  `/signin`, public pages 200, and no page returns the React error boundary
  (which would catch the deferred-loader/#419 class).
- **Authenticated behavior.** Probing is credential-free by design, so it proves
  endpoints reject correctly, not that they *work* when authorized. That
  remains E2E's job.
- **Provider-auth in CI.** Nothing verifies signature enforcement inside CI; the
  strict run needs a deployed environment.
