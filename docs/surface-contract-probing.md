# Surface contract probing

**Added:** 2026-07-29 · **Script:** `scripts/probe-surfaces.mjs`

```bash
npm run probe:dev       # or probe:staging / probe:prod / probe:local
npm run probe -- --help
```

Named targets carry the right defaults, so the common case takes no flags:
deployed targets probe with strict provider auth and page routes on; `local`
relaxes provider auth because the compose harness disables it. Override with
`--strict` / `--relaxed` / `--no-pages`; point at an arbitrary host with
`npm run probe -- https://…`. Staging has no URL until it is provisioned —
set `PROBE_URL_STAGING` (the script says so if you forget).

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
| any deployed env | strict by default — also requires unsigned webhooks to 403 | run manually / as a WS-D release gate |

Run against a deployed environment before every production release:

```bash
npm run probe:prod        # or probe:staging / probe:dev
```

Result on deployed dev, 2026-07-30: **261/261 OK** (191 API + 70 page).

## Maintenance

- **Params**: `PARAM_VALUES` maps param names to seeded E2E ids
  (`scripts/e2e/seed-data.mjs`). Param names are not globally unique — `:id` is
  a workspace UUID on page routes but a numeric outreach-attempt id on
  `/api/outreach_attempts/:id` — so use `PATH_PARAM_OVERRIDES` for those.
- **Exceptions**: `EXPECTED_EXCEPTIONS` holds responses that are correct despite
  failing the generic rule (currently only idempotent sign-out returning 200).
  Every entry carries a reason. Do not add one to silence a finding you have not
  explained.

## Page routes (`--include-pages`)

70 page routes are enumerated from the router and classified **by reading the
code that guards them**, never from a hand-maintained list (list drift is this
repo's most common bug class):

- **protected** — the module sits under a subtree with a
  `*.middleware.server.ts` (`workspaces+/$id`, `admin+/`), or its sibling
  `*.loader.server.ts` calls `verifyAuth` / `createAuthLayoutLoader` /
  `requireWorkspaceAccess`. Adding a newly-guarded page needs no edit here.
- **public** — everything else.

Assertions: protected pages must redirect to `/signin` (a **200 is reported as
an auth bypass**), static param-free paths must not 404 (unrouted), and nothing
may 5xx.

The run prints coverage by class and **fails if zero protected routes were
found** — a classifier that silently degraded to "everything is public" would
otherwise produce a meaningless green.

Deployed dev, 2026-07-29: 261/261 (191 API + 70 page); 55 protected pages all
redirecting, 15 public serving 200.

## Known gaps (not yet covered)

- **Hydration errors are invisible here.** React #419 / deferred-loader hangs
  affect the *browser*, not curl — bots receive fine SSR HTML while real users
  get a permanent fallback. Catching that class requires Playwright with a real
  browser, not this prober. Do not read a green page-probe as "the page renders".
- **Authenticated behavior.** Probing is credential-free by design, so it proves
  endpoints reject correctly, not that they *work* when authorized. That
  remains E2E's job.
- **Provider-auth in CI.** Nothing verifies signature enforcement inside CI; the
  strict run needs a deployed environment.
- **`/signin?next=` precision.** `/account/security` redirects to
  `next=/account` (the parent), because `verifyAuth` takes a static `nextUrl`.
  Cosmetic; noted rather than fixed.
