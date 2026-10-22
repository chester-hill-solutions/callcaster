# Sim Suite

The `sim` suite is separate from normal Playwright E2E. It is for explicit,
paid provider checks against a selected environment. `npm run test:e2e` and
local CI do not include it.

## Sai-local SMS flow

`npm run test:sim` currently runs the `sai-local` SMS proof only when these
environment variables are set in the calling shell or secret manager:

```text
SIM_SENDER_EMAIL=<sender account email>
SIM_SENDER_PASSWORD=<sender account password>
SIM_RECIPIENT_NAME="Saihaan Syed"
SIM_RECIPIENT_PHONE=+16478657844
# Optional; defaults to "CallCaster SIM SMS check".
SIM_SMS_MESSAGE="<unique test message>"
```

The suite rejects a missing or changed sai-local workspace or recipient value.
This prevents an environment mix-up from sending a live message to an
unapproved number.

The planned inherited configuration and secret-provider migration is defined in
[ADR-0040](adr/0040-inherited-config-and-pluggable-secrets.md). Until ADR-0040
Phase 5 migrates SIM, this page describes the current interface. Do not add new
SIM-specific variables; new SIM work uses the compatibility boundary until the
shared loader is available.

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
