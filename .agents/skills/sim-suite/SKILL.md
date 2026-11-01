---
name: sim-suite
description: Use when creating, running, debugging, or extending the isolated CallCaster sim browser flows for real provider traffic. Covers SIM_* configuration, task composition, CSV call-list uploads, credit funding, and flow orchestration.
---

# CallCaster sim suite

Use this skill for the paid, explicit `sim` suite. Do not use it for normal
Playwright E2E, unit tests, or CI. The suite runs only through its own config:

```bash
npm run test:sim
npm run test:sim:headed
```

## Safety boundary

- `e2e/playwright.sim.config.ts` is separate from `e2e/playwright.config.ts`.
- Sim tests live under `e2e/sim/` and end with `.sim.spec.ts`.
- The sim config runs one worker with no retries. Never add it as a dependency
  of the normal E2E project.
- Resolve catalog personas through `createSimRuntimeContext`. The current flow
  uses `person-a` for owner funding and `person-b` for member SMS, in separate
  browser contexts for the same marked workspace.
- `e2e/sim/config.ts` is the temporary #2812 recipient/message adapter. Keep its
  approved-recipient check. Do not hardcode a workspace ID or choose a stronger
  persona inside a task.
- Sender credentials and recipient values come from environment variables. Do
  not commit them, print them, attach them, or put them in traces.
- The SMS flow creates real provider traffic. Run it only when the recipient is
  explicitly approved.

## Local configuration

The runner uses the local app at `http://127.0.0.1:3000`. It does not need a
sim URL variable. The local app, worker, object storage, Stripe test setup, and
any provider callback configuration are outside the Playwright config.

Required variables:

```bash
SIM_RECIPIENT_NAME='Saihaan Syed'
SIM_RECIPIENT_PHONE='+16478657844'
```

Optional message override:

```bash
SIM_SMS_MESSAGE='CallCaster SIM SMS check'
```

Quote values containing spaces or shell metacharacters. Load an untracked file
with `set -a; source .env.sim.local; set +a`. Never change the user's normal
`.env` files automatically.

Set `DEV_NAME` and `ENV` through the shared local configuration. Use the
resolved persona credential names with the configured SecretProvider. Among
browser tasks, only sign-in can request its persona password. Other tasks
receive a non-secret context. The recipient adapter fails closed when the
approved values differ. Do not accept arbitrary live destinations.

## Architecture

Each flow is composed from three layers:

```text
config → tasks → flow/spec
```

### Config

`createSimRuntimeContext` resolves a typed profile from the shared project
configuration and persona catalog. `prepareSimSmsTaskContexts` checks saved
identity, workspace, role and capabilities before browser work.
`e2e/sim/config.ts` returns typed recipient, message and checkout inputs only.
Keep secrets out of profiles, task inputs and artifacts.

### Tasks

Tasks are small, reusable browser operations. They must complete one product
operation and fail with a clear UI assertion:

- `tasks/sign-in.ts` — sign in and verify the workspace landing page.
- `tasks/contact-list.ts` — generate a CSV artifact, attach it, upload through
  the Call Lists UI, and wait for worker-backed completion.
- `tasks/credits.ts` — calculate required credits from `shared/pricing.ts`, read
  `data-testid="workspace-credit-balance"`, and purchase only when needed.
- `tasks/sms.ts` — open Chats, fill the composer, send, and verify the message
  bubble.

Do not insert contacts or credits directly into the database. These flows prove
the product UI and worker path.

### CSV call-list task

Generate the CSV under `testInfo.outputDir`, creating that directory first.
Attach the CSV as a test artifact, then use the real upload wizard. The worker
must finish before the flow sends a message. Keep the CSV minimal and include a
stable external ID so reruns are diagnosable.

### Credit task

Use `estimateMessageCredits` from `shared/pricing.ts`; do not copy pricing
constants into the sim suite. Read the current balance before opening checkout. Return without purchasing
when the balance covers the operation.

If funding is needed, respect `MIN_CREDITS` and purchase the smallest amount
that covers the flow. Local uses local test checkout with real one-time ledger
fulfillment. Deployed profiles use Stripe test mode only. Production refuses
mock checkout. Do not hard-code live payment credentials.

## Flow orchestration

The spec is the orchestration layer. Keep its order explicit:

Resolve and preflight both personas first. In an owner browser context, sign in
and ensure credits. Close that context. In a member context, sign in, upload the
contact list, wait for the worker, and send through Chats. The tasks must not
switch personas or retrieve credentials for another task.

Add new flows as separate `.sim.spec.ts` files. Reuse tasks. Add a new task only
when the operation is reusable across two or more flows or needs its own
failure boundary.

Use run-specific message text when a later peer or recipient must correlate the
result. Attach redacted evidence: environment alias, workspace ID if safe for
the local artifact, recipient alias or last four digits, required credits, and
provider IDs when the flow can obtain them. Never attach passwords, full card
data, auth cookies, or full phone numbers.

## Debugging order

1. Confirm the local app is running at `127.0.0.1:3000`.
2. Confirm the sender can sign in manually.
3. Confirm the worker and object storage are running.
4. Check the generated CSV artifact and Call Lists upload status.
5. Check the credit balance locator before investigating Stripe.
6. Check the Chats UI and server logs for the provider send.
7. Do not blindly rerun a real send after a timeout. First check whether the
   message was accepted and persisted.

## Adding a new simulated operation

1. Resolve its catalog persona and shared environment profile; approve its assets.
2. Add or reuse typed config values.
3. Implement one task per UI/product boundary.
4. Calculate its cost from the canonical pricing module.
5. Add one sequential `.sim.spec.ts` flow.
6. Add redacted evidence and an explicit timeout.
7. Run collection, focused headed verification, `git diff --check`, and the
   relevant typecheck before committing.

Source of truth:

- `docs/sim-suite.md`
- `e2e/playwright.sim.config.ts`
- `e2e/sim/config.ts`
- `e2e/sim/tasks/`
- `shared/pricing.ts`
