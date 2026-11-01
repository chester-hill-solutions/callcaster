# Sim Suite

The `sim` suite is separate from normal Playwright E2E. It is for explicit,
paid provider checks against a selected environment. `npm run test:e2e` and
local CI do not include it.

Read-only profile checks are available before any browser or task flow:

```bash
npm run sim:profile:list
npm run sim:profile:status -- --persona person-a
npm run sim:profile:check-access -- --persona person-a --capability simulation.manage
```

These commands use only catalog personas and shared configuration, and query
the exact derived user email, marked workspace name, and canonical membership.
They never reconcile, repair, audit, create resources, or read credentials.
Catalog capabilities are a SIM allowlist. The canonical workspace role matrix
is the real authorization floor: owner-only capabilities deny members.

## Resolved-profile SMS flow

`npm run test:sim` currently runs the `sai-local` SMS proof only when these
environment variables are set in the calling shell or secret manager:

```text
SIM_RECIPIENT_NAME="Saihaan Syed"
SIM_RECIPIENT_PHONE=+16478657844
# Optional; defaults to "CallCaster SIM SMS check".
SIM_SMS_MESSAGE="<unique test message>"
```

The temporary compatibility adapter rejects a missing or changed approved
recipient value. The sender email is derived from the resolved SIM persona;
the password is retrieved only by the sign-in task through the runtime context.
This prevents an environment mix-up from sending a live message to an
unapproved number.

The planned inherited configuration and secret-provider migration is defined in
[ADR-0040](adr/0040-inherited-config-and-pluggable-secrets.md). Until ADR-0040
Phase 5 migrates SIM, this page describes the current interface. Do not add new
SIM-specific variables; new SIM work uses the compatibility boundary until the
shared loader is available.

`e2e/sim/config.ts` is the temporary #2812 compatibility adapter. It is only
used at SIM bootstrap to build typed task input. Task modules do not import it.

The flow does these tasks through the product UI:

1. Resolve `person-a` (owner) and `person-b` (member) in the same marked workspace.
   Check identity, role and capabilities before browser work.
2. Sign in as the owner and fund only the shortfall, subject to the minimum
   purchase, through Stripe test checkout.
3. Close the owner context. Sign in as the member in a separate context.
4. Upload a one-contact CSV through Call Lists and wait for the worker.
5. Send the approved message through Chats as the member.

Among browser tasks, only sign-in can request the persona password. Other tasks
receive a non-secret context. Profile reconciliation creates or repairs the
credential account with the resolved password; it does not fund credits or call
a provider. All contexts close even when a task fails.

Normal CI verifies persona credentials and task access without provider traffic.
Handset delivery remains a separate step that needs an explicit operator request.
Local mock checkout and Twilio setup additions from the earlier candidate are
parked separately; they are not part of the persona migration.

The generated CSV and a redacted evidence record are Playwright artifacts.
They are not committed. The local target needs a running app, worker, object
storage, and the local Stripe test configuration.

Run the browser visibly when first configuring an environment:

```bash
npm run test:sim:headed
```

The command creates real Twilio traffic. Run it only for the explicit
allowlisted recipient in the selected profile.
