# Sim Suite

The `sim` suite is separate from normal Playwright E2E. It is for explicit,
paid provider checks against a selected environment. `npm run test:e2e` and
local CI do not include it.

Read-only profile checks are available before any browser or task flow:

```bash
npm run sim:profile:list
npm run sim:profile:status -- --persona person-a
npm run sim:twilio:status -- --persona person-a
npm run sim:profile:check-access -- --persona person-a --capability simulation.manage
```

These commands use only catalog personas and shared configuration, and query
the exact derived user email, marked workspace name, and canonical membership.
They never reconcile, repair, audit, create resources, or read credentials.
Catalog capabilities are a SIM allowlist. The canonical workspace role matrix
is the real authorization floor: owner-only capabilities deny members.

## Resolved-profile SMS flow

### Existing local sender

Sender attachment and status are local-only. Attachment uses an explicit
existing sender already owned by the SIM workspace account. It does not buy,
transfer, rent, or release a number. It does not change Twilio state, attach a
Messaging Service, or claim that the sender is compliant. The operator must
separately attest that the planned traffic is approved and compliant; provider
capabilities do not prove compliance. Use placeholders only in command examples:

### Local Twilio workspace setup

`sim:profile:ensure` creates or repairs SIM identity, credentials, membership,
and audit data only. It does not call a provider. Before a real-provider SIM
flow, explicitly inspect and provision its local workspace:

```bash
npm run sim:twilio:status -- --persona <key>
npm run sim:twilio:ensure -- --persona <key>
```

The status command is read-only and redacted. Ensure creates a Twilio subaccount,
API key, and Messaging Service for an exact existing marked local profile. It
does not rent or attach a number, send SMS or calls, create Stripe customers,
add credits, seed data, or enable geo permissions. Sender attachment remains a
separate explicit command. These commands refuse dev, QA, production, and hosted
runtime identities. A provider resource that cannot be proved to belong to the
SIM workspace causes a safe failure; resolve that state manually before retrying.
If status reports `manual-recovery`, Twilio may have created an API key but the
one-time secret was not saved. Do not retry key creation. An administrator must
inspect the child account, revoke any unusable key, and restore the workspace's
canonical credentials before provisioning can continue.

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

Profiles use the shared project configuration and secret-provider boundary in
[ADR-0040](adr/0040-inherited-config-and-pluggable-secrets.md). The temporary
recipient adapter remains until #2812 is complete. Do not add new SIM-specific
variables or read dotenv files inside browser tasks.

`e2e/sim/config.ts` is the temporary #2812 compatibility adapter. It is only
used at SIM bootstrap to build typed task input. Task modules do not import it.

The flow does these tasks through the product UI:

1. Resolve `person-a` (owner) and `person-b` (member) from the same marked
   workspace. Check both roles and required capabilities before browser work.
2. Sign in as the owner. Read the balance and calculate the SMS requirement
   from the shared rate card. Buy only the shortfall, subject to the minimum
   purchase. The local profile uses the local test checkout and the real ledger;
   deployed profiles use Stripe. Production refuses mock checkout.
3. Close the owner browser context. Sign in as the member in a separate context.
4. Generate a one-contact CSV and upload it through Call Lists. Wait for the
   worker-backed upload to complete.
5. Send the configured SMS through Chats as the member.

Among browser tasks, only sign-in can request the persona password. The other
tasks receive a non-secret context and cannot select a stronger persona.

Normal CI verifies configuration, task permissions, local checkout roles and
one-time ledger fulfillment without provider traffic. It does not prove handset
delivery. The real SMS step requires a separate explicit operator request.

The generated CSV and a redacted evidence record are Playwright artifacts.
They are not committed. The local target needs a running app, worker, object
storage, reconciled personas, and an approved existing SMS sender. Local test
checkout does not need a Stripe customer or card.

Run the browser visibly when first configuring an environment:

```bash
npm run test:sim:headed
```

The command creates real Twilio traffic. Run it only for the explicit
allowlisted recipient in the selected profile.
