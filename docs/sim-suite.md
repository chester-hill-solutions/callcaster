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

## Sai-local SMS flow

### Existing local sender

Sender attachment and status are local-only. Attachment uses an explicit
existing sender already owned by the SIM workspace account. It does not buy,
transfer, rent, or release a number. It does not change Twilio state, attach a
Messaging Service, or claim that the sender is compliant. The operator must
separately attest that the planned traffic is approved and compliant; provider
capabilities do not prove compliance. Use placeholders only in command examples:

```bash
npm run sim:sender:status -- --persona <key>
npm run sim:sender:attach -- --persona <key> --phone <E.164> --compliance-attested
```

The attachment command prints only a phone number's last four digits. Do not
use a real number unless the operator has separately approved its use.

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

1. Sign in as the configured sender.
2. Generate a one-contact CSV and upload it through Call Lists.
3. Wait for the worker-backed upload to complete.
4. Read the current credit balance and calculate the SMS requirement from the
   shared rate card.
5. Open Stripe Checkout only when the balance is too low. It purchases the
   smallest permitted amount that covers the flow.
6. Send the configured SMS through Chats.

The generated CSV and a redacted evidence record are Playwright artifacts.
They are not committed. The local target needs a running app, worker, object
storage, and the local Stripe test configuration.

Run the browser visibly when first configuring an environment:

```bash
npm run test:sim:headed
```

The command creates real Twilio traffic. Run it only for the explicit
allowlisted recipient in the selected profile.
