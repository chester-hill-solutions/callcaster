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
- The current profile is `sai-local`. Its workspace ID, workspace key, and
  approved recipient are fixed in `e2e/sim/config.ts`.
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
SIM_SENDER_EMAIL='sender@example.test'
SIM_SENDER_PASSWORD='password'
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

The loader fails closed when the configured environment profile or recipient
does not match the fixed approved values. Add a new environment by adding an
explicit profile and guard; do not make workspace IDs or recipient numbers
arbitrary command-line input for a live flow.

## Architecture

Each flow is composed from three layers:

```text
config → tasks → flow/spec
```

### Config

`e2e/sim/config.ts` returns a typed `SimSmsConfig`:

- sender login;
- fixed workspace identity;
- approved recipient identity;
- message input;
- public Stripe test-card values used only inside Checkout.

Keep provider and workspace constants in the profile. Keep operator-specific
credentials in environment variables.

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
constants into the sim suite. Read the current balance before opening Stripe
Checkout. Return without purchasing when the balance covers the operation.

If funding is needed, respect `MIN_CREDITS` and purchase the smallest amount
that covers the flow. Use Stripe test mode only. Do not hard-code live payment
credentials.

## Flow orchestration

The spec is the orchestration layer. Keep its order explicit:

```ts
const sim = loadSaiLocalSmsConfig();
await signInForSim(page, sim.sender);
await uploadSimContactList({ page, testInfo, workspaceId: sim.workspace.id, contact: sim.recipient });
await ensureSmsCredits({ page, workspaceId: sim.workspace.id, message: sim.message, stripe: sim.stripe });
await sendSmsFromChats({ page, workspaceId: sim.workspace.id, recipientPhone: sim.recipient.phone, message: sim.message });
```

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

1. Define its fixed environment profile and approved assets.
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
