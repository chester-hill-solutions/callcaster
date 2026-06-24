# End-to-end (E2E) testing

Browser E2E tests use [Playwright](https://playwright.dev/) against a production build of the app and local Supabase.

## Prerequisites

- Docker (Supabase local)
- Supabase CLI
- Node 20+

## Quick start

```bash
supabase start
eval "$(supabase status -o env)"
export SUPABASE_URL="${API_URL}"
export SUPABASE_SERVICE_KEY="${SERVICE_ROLE_KEY}"
export SUPABASE_ANON_KEY="${ANON_KEY}"
export SUPABASE_PUBLISHABLE_KEY="${ANON_KEY}"
npm run test:e2e:seed          # idempotent; use instead of db reset if migrations are incomplete locally
npm run build
npm run test:e2e:server &      # separate terminal — waits for /readyz on port 3100
E2E_BASE_URL=http://127.0.0.1:3100 npm run test:e2e
```

E2E defaults to **port 3100** (`e2e/playwright.config.ts`) so it does not collide with a dev server on 3000. Override with `E2E_BASE_URL` if needed.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run test:e2e` | Run full Playwright suite |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run test:e2e:debug` | Headed debug |
| `npm run test:e2e:rbac` | RBAC spec only |
| `npm run test:e2e:seed` | Seed deterministic test data |
| `npm run test:e2e:server` | Start production server with E2E env |

## Seed users (local only)

| Email | Role | Password |
|-------|------|----------|
| `owner@e2e.test` | workspace owner | `E2eTestPass1!` |
| `admin@e2e.test` | workspace admin | `E2eTestPass1!` |
| `member@e2e.test` | member | `E2eTestPass1!` |
| `caller@e2e.test` | caller | `E2eTestPass1!` |
| `sudo@e2e.test` | sudo admin | `E2eTestPass1!` |
| `invitee@e2e.test` | pending invite | `E2eTestPass1!` |
| `authflow@e2e.test` | sign-in/sign-out smoke only (not in Playwright storage fixtures) | `E2eTestPass1!` |

AUTH-06 signs out as `authflow@e2e.test` so Supabase session revocation does not invalidate parallel tests that reuse `owner@e2e.test` / `member@e2e.test` storage state.

## Workspaces

| ID | Name | Purpose |
|----|------|---------|
| `a0000000-0000-4000-8000-000000000001` | E2E Ready Workspace | Primary — campaigns, queue, chats, survey |
| `a0000000-0000-4000-8000-000000000002` | E2E Onboarding Workspace | Incomplete onboarding redirect |
| `a0000000-0000-4000-8000-000000000003` | E2E Empty Workspace | Empty states, zero credits |

## Mock boundaries

- **Twilio**: network routes intercepted in `e2e/fixtures/twilio-mocks.ts`; Voice SDK stubbed in-browser. No real calls.
- **Stripe**: billing UI tested; checkout uses mock redirects (no stripe.com in CI).
- **Webhooks**: `e2e/fixtures/webhooks.ts` POSTs to local routes with `TWILIO_VALIDATE_WEBHOOKS=false`.

## Scenario catalog

Specs live under `e2e/specs/` with IDs in test titles:

| Domain | Spec file | IDs |
|--------|-----------|-----|
| Auth | `auth.spec.ts` | AUTH-01 … AUTH-08 |
| RBAC | `rbac.spec.ts` | RBAC-01 … RBAC-18 |
| Errors | `errors-empty-states.spec.ts` | ERR-* |
| Onboarding | `onboarding.spec.ts` | ONB-* |
| Campaigns | `campaign-*.spec.ts` | CAM-* |
| Dial / call | `dial-modes.spec.ts`, `call-screen.spec.ts` | DIAL-* |
| IVR | `ivr-script-editor.spec.ts` | IVR-* |
| Messaging | `message-campaign.spec.ts`, `chats.spec.ts` | MSG-*, CHAT-* |
| Audience | `audience-contacts.spec.ts` | AUD-* |
| API keys | `workspace-api-keys.spec.ts` | API-* |
| Billing | `billing-stripe.spec.ts` | PAY-* |
| Exports | `exports-analytics-calls.spec.ts` | EXP-*, ANA-*, CALL-* |
| Surveys | `survey-public.spec.ts`, `survey-admin.spec.ts` | SURV-* |
| Admin | `admin-portal.spec.ts` | ADM-* |
| Realtime | `realtime.spec.ts` | RT-* |
| Handset | `handset-inbound.spec.ts` | HND-* |
| Scripts | `scripts-audio.spec.ts` | SCR-* |

Tags: `@smoke`, `@rbac`, `@security`, `@realtime`, `@slow`, `@sudo`, `@authenticated`.

## CI

[`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) runs on **push to main** and **nightly**. PRs do not run E2E (Vitest CI stays fast).

Failed runs upload Playwright HTML report artifacts.

## Debugging

```bash
npx playwright show-report e2e/playwright-report
```

Traces are captured on first retry (`trace: on-first-retry`).

## Adding scenarios

1. Add seed data in `scripts/e2e/seed-database.mjs` if needed.
2. Use factories in `e2e/fixtures/factories.ts` for per-test mutations.
3. Prefer page objects in `e2e/pages/`.
4. Name tests with scenario IDs for traceability.
