# Synthetic Telephony Testing

## System explanation

## Goal

Extend `e2e/sim/` into an agent-friendly SIM system. A developer or agent can
compose named tasks to reproduce a bug, verify a fix, inspect UI values and
metrics at checkpoints, or run a predefined flow. The system must test SMS,
campaigns, live calls, IVRs, audio, workers, and scale without buying a large
phone-number inventory.

```text
SIM tasks + persona manifest
  → real CallCaster UI, API, worker, and test audience
  → synthetic SMS or SIP persona response
  → checkpoints, metrics, and redacted artifacts
```

The existing `e2e/sim/` is the starting pattern: it composes sign-in, CSV
upload, credit, and SMS tasks in one explicit paid flow. It currently has one
fixed SMS profile and no shared voice or persona capability.

## First POC: SIM profiles, roles, and credentials

First expand `e2e/sim/` so many developers and agents can run SIM tasks safely
without hand-authoring profiles or sharing one account. Do this before voice or
SIP work.

A profile is an idempotently provisioned test identity bundle. It is a logical
persona definition, not an environment-specific account:

```text
logical persona key + environment → test user + workspace + role + credentials
```

Define the personas once in a checked-in catalog. Each persona has a stable
`personaKey`, such as `person-a`. This key identifies the logical test user
across all environments; it is not an email address, database ID, or role.
The selected environment has its own stable `environmentName`, such as
`sai-local`, `dev`, or `qa`. The pair
`personaKey + environmentName` identifies one generated account.

For example:

| Logical persona | Workspace | Role | Owns |
|---|---|---|---|
| `person-a` | `SIM Workspace A` | Owner | Workspace A and owner-level flows |
| `person-b` | `SIM Workspace A` | Member (Agent) | Agent-level flows and persona B's test manifest |
| `person-c` | `SIM Workspace B` | Owner | Workspace B and owner-level flows |

The catalog contains the logical key, workspace name, role, allowed flows, and
owned persona-manifest keys. It contains no password, phone number, API key, or
environment URL. `person-b` being an Agent in Workspace A is independent from
`persona-b` being the SIP behavior that Person B owns. Keep those concepts in
different fields and types.

In the application, the canonical workspace role is `MemberRole.Member`
(`member`). “Agent” is the SIM persona label for that human scenario; it maps
to the application's `member` role. Do not add a new `agent` database role for
SIM.

The shared project configuration supplies the selected environment's account
namespace and email domain. The SIM catalog does not define environments. The
same catalog entry therefore produces predictable isolated addresses without
duplicating persona declarations:

```text
person-a + dev       → person.a@dev.callcaster.ca
person-a + sai-local → person.a@sai-local.callcaster.ca
person-b + dev       → person.b@dev.callcaster.ca
person-b + sai-local → person.b@sai-local.callcaster.ca
```

The bootstrap command creates or repairs the account for the selected
`logical persona + ProjectConfig environment`. It writes local secrets to an
ignored `.sim/` file and returns references to the shared secret provider. It
must show the selected persona, environment, email, workspace, role, credential
source, and approved traffic policy before it runs.

Suggested commands:

```bash
npm run sim:profile:ensure -- --persona person-a --environment sai-local
npm run sim:run -- --persona person-a --environment sai-local --flow sms-send
```

`sim:profile:ensure` must be safe to rerun. It creates a distinct test user and
workspace when missing, assigns the catalog role, and keeps stable identifiers
on later runs. It must never change `.env`, create a production user, or reveal
secrets in logs or artifacts. A remote runner uses a service credential to
ensure a short-lived environment profile; a human developer uses the generated
local secret file. Existing SIM tasks receive a resolved profile object, not
loose `SIM_SENDER_*` variables.

The POC needs no inbound mailbox. Seed Better Auth users directly, as current
E2E setup already does, for ordinary sign-in. Add inbound-email provisioning
only when a task tests invitation, reset-password, or verification delivery.

The initial catalog is deliberately small and fixed:

- `person-a`: Owner of `SIM Workspace A`; owns owner-level SMS, billing, and
  simulation-management flows.
- `person-b`: Member/Agent of `SIM Workspace A`; owns the `persona-b` behavior
  manifest and performs audience, campaign, and messaging flows.
- `person-c`: Owner of `SIM Workspace B`; reserved for cross-workspace and
  isolation flows.

Add a new logical persona only when a task needs a role, workspace relationship,
or ownership relationship that these three cannot express. Do not create one
persona per environment. Do not check environment-specific persona files into
`e2e/sim/`; ADR-0040 owns the shared project environment configuration.

## Services and callers

### Persona catalog and task permissions

Every SIM task declares the minimum access it needs. The declaration is part of
the task definition, not a comment and not a command-line override:

```ts
export const taskDefinition = {
  name: "ensure-sms-credits",
  requires: {
    workspaceRole: "owner",
    capabilities: ["billing.purchaseTestCredits"],
  },
} as const;
```

Use this role order: `agent/member < admin < owner`. A task may also require a
capability, because role names alone are not enough for billing, user
management, or telephony. The runner validates the declaration before opening
the browser:

1. Read the task requirement.
2. Select a catalog persona whose role and capabilities satisfy it.
3. Resolve that persona for the selected environment.
4. Refuse to run if no matching persona exists; never elevate a lower-role
   persona automatically.
5. Sign in with the selected account and verify the expected workspace role
   before the first mutating action.

Task requirements use workspace scope. `workspaceRole: "member"` means the
persona must be a Member (Agent) or higher in the target workspace. A task that acts on
another user's settings must additionally declare `capabilities:
["workspace.manageMembers"]`. A task that only reads a campaign may declare
`workspaceRole: "member"` and `capabilities: ["campaign.read"]`.

The first task declarations are:

| Task | Minimum requirement | Selected first persona |
|---|---|---|
| Sign in and read workspace | Member (Agent) + `workspace.read` | `person-b` |
| Upload audience CSV | Member (Agent) + `audience.write` | `person-b` |
| Create or launch campaign | Member (Agent) + `campaign.write` | `person-b` |
| Purchase test credits | Owner + `billing.purchaseTestCredits` | `person-a` |
| Send SMS from Chats | Member (Agent) + `message.send` | `person-b` |
| Manage users, roles, or workspace settings | Owner + matching management capability | `person-a` |
| Create/release a simulation run | Owner + `simulation.manage` | `person-a` |

These are the declared requirements for the SIM suite. During implementation,
each requirement is checked against the route's actual authorization rule. If
the application requires a higher role, update the task declaration and the
catalog assignment before implementation continues. Do not weaken the app
authorization to make a SIM task pass.

### SIM tasks

Tasks are small browser or API operations with clear assertions. They must be
safe to compose and must expose their output to the next task.

Initial tasks:

- sign in to a named test workspace;
- generate and upload an audience CSV;
- create or launch a campaign;
- ensure test credits;
- send SMS and wait for the selected result;
- start a live or IVR call;
- pause/release a persona checkpoint;
- read UI values and run metrics;
- collect redacted artifacts.

Developers and agents invoke tasks manually. Predefined SIM specs compose the
same tasks to protect known behavior, for example: CSV upload → launch campaign
→ voicemail persona → callback → billing and queue assertions.

### SIP handler

Build or deploy a separate SIP persona service. It accepts
`sip:<persona>@synthetic.example`, then follows a versioned persona manifest:

- answer, ring without answer, voicemail, silence, or hang up;
- play recorded RTP audio;
- wait for or send DTMF;
- record timestamps and media facts; and
- report the expected and observed result to the simulation run.

Use recordings first. They are deterministic and sufficient for IVR,
transcription, coaching, recording, and callback flows. AI agents are optional
exploratory tools, not a load-test dependency.

The handler owns **callee-side** RTP. For campaign IVR calls, CallCaster already
provides **caller-side** audio with TwiML `<Play>`. For a browser-agent speech
test, use a controlled test softphone with a virtual microphone or synthetic
WebRTC track. Do not try to inject reply audio through the existing media-stream
service: it captures both tracks but is unidirectional.

SIPp is suitable for a first handler/load component: it can emulate many SIP
callees, replay RTP/PCAP media, send DTMF, and export call statistics. Add a
media server only when a persona needs dynamic bridging or conversation logic.

## Audiences and persona binding

Use real CSV uploads whenever audience import is part of the scenario. This
extends the existing `e2e/sim/tasks/contact-list.ts` flow and tests header
mapping, validation, deduplication, persistence, and worker completion.

```csv
First name,Last name,Phone number,External ID
Hello,Hangup,+15555501001,sim-run-123-hello-hangup
Silent,Answer,+15555501002,sim-run-123-silent-answer
```

`External ID` identifies a contact within one run. A run manifest maps that ID
to a persona. Keep the phone field as a normal synthetic E.164 value.

Routing is per contact. A CSV can contain both simulation-bound and ordinary
contacts. For an active SIM run, a bound contact resolves to its SIP persona;
an unbound contact retains its normal destination. This is useful for a small
mixed-flow test, but it has a safety rule: in a synthetic environment, unbound
contacts must be excluded from a SIM campaign unless they match an explicit
approved-PSTN allowlist. A typo must never turn a synthetic bulk run into real
outbound traffic.

Do **not** add `cc_sip_id` to normal contact data unless a later product need
requires it. It would spread test transport detail into imports, exports, API
contracts, validation, and customer data. Do not put a SIP URI in the phone
field.

For repeated large runs where upload behavior is not under test, create the
audience through a test fixture. Keep at least one CSV-upload SIM flow for each
scenario family. Generate files per run, attach a redacted artifact, and never
use customer data.

## SIP routing boundary

SIP routing is test infrastructure, never a CallCaster user feature. Normal
product traffic stays unchanged:

```text
normal environment: CallCaster → Twilio → customer phone number
SIM voice run:     CallCaster → Twilio → SIP handler persona
```

Use one server-side telephony destination resolver, next to the existing Twilio
call boundary. It receives the contact and simulation-run context. It returns a
SIP URI only when all conditions hold:

1. the environment explicitly enables synthetic telephony;
2. the run is authorized and the contact has a manifest binding; and
3. the environment is not production.

Otherwise it returns the normal phone number. This combines an environment
switch with a run/contact binding. An environment switch alone is too broad; a
contact column alone risks production use. The resolver is the only place that
knows SIP exists, so routes and campaign code do not gain scattered `SIM_*`
branches.

## Identities, credentials, and audio path

The SIP handler has no email login. It accepts SIP calls with a dedicated SIP
credential and Twilio source/network controls. The app's test callers do need
normal CallCaster identities.

| Need | Configuration |
|---|---|
| SIM task actor | A catalog persona with a defined workspace role. Store local credentials only in `.sim/profiles/`; use GitHub environment secrets for remote runner credentials. |
| Scheduled runner | A service credential that can create/release simulation runs; never a human password in CI. |
| Twilio | Dedicated test account or subaccount, API key, caller ID, and spend/concurrency limit. Do not use a customer workspace subaccount. |
| SIP handler | Public DNS name, static network policy, SIP TLS/SRTP where supported, and a dedicated SIP username/password. Pass those credentials only from the destination resolver. |
| Email-dependent flow | Seed the Better Auth user directly for ordinary sign-in. Use the isolated mail service/test inbox only when the behavior under test is verification, invitation, or password recovery. |

Environment-resolved personas replace the current fixed `sai-local` profile. A
resolved profile selects the logical persona, environment, workspace, actor
secret references, Twilio test account, handler endpoint, spend cap, and
approved-PSTN list. It must not accept arbitrary destinations or roles from a
command line.

The test runner does not call Twilio directly. It acts through CallCaster:

```text
SIM task clicks Launch / Dial in CallCaster
  → CallCaster calls Twilio with its normal flow URL
  → Twilio fetches CallCaster TwiML
  → CallCaster <Play> audio reaches the SIP handler
  → SIP handler sends recorded RTP / DTMF / hangup
  → Twilio forwards media and status callbacks to CallCaster
  → task reads CallCaster UI and simulation timeline
```

For an IVR campaign, CallCaster's existing TwiML audio is the caller-side
audio. For a browser-agent conversation, run the normal Voice SDK client with
a test-only virtual microphone or synthetic WebRTC audio track; that browser
then supplies the caller-side audio. The SIP handler always supplies the
callee-side audio. Neither path injects media through the existing
unidirectional media-stream service.

## SIP handler deployment

Start with a separately deployed Linux service, not Railway or a GitHub-hosted
runner. It needs stable public DNS/IP, SIP signalling ports, a restricted RTP
port range, TLS certificates, and firewall rules that allow Twilio's published
SIP/media ranges. Run the handler in the same region as the QA environment.

Initial implementation:

1. Package SIPp UAS scenarios and checked-in audio/PCAP assets in a container.
2. Route SIP URI user names to the persona manifest and a simulation run.
3. Use SIP digest credentials from the resolver and reject unknown users/runs.
4. Emit signed run events for answer, DTMF, playback start/end, hangup, and
   failures.
5. Add RTP capture metadata only; retain audio recordings only when a scenario
   explicitly requires them.

SIPp is the load generator only. Asterisk is the SIP/RTP service. Do not add a
SIP proxy, a second media server, or another PBX product to this design.

Twilio supports SIP URIs in the Calls API. One SIP domain can serve many
persona names, so synthetic contacts do not need rented DIDs. This is a small
real-provider test cost, not a scale strategy. See [Twilio SIP Calls](https://www.twilio.com/docs/voice/api/sip-making-calls)
and [SIPp load testing](https://sipp.readthedocs.io/en/latest/perftest.html).

## Email and DNS decision

Use these decisions. They remove email and DNS as open design work.

- **Local email:** use the existing Inbucket service. Each local profile uses
  `sim-<profile>@local.test`; Inbucket accepts it without mailbox setup.
- **Normal profile login:** create the Better Auth user directly. The profile
  does not wait for an email, and no personal mailbox is used.
- **Remote email test:** use `sim-<run-id>@mail.qa.callcaster.ca`. Configure a
  Cloudflare Email Routing catch-all rule to send this subdomain to a
  Cloudflare Email Worker. The Worker validates the recipient format, stores a
  redacted message in the simulation-run service, then exposes it through the
  run API. It rejects all other mail. Tasks poll that API rather than an inbox.
- **Outbound email:** keep Resend as the CallCaster sender. Add the required
  sending-domain verification records to the DNS module. The test mailbox does
  not send mail.
- **Retention:** store message metadata and a redacted HTML/text body for seven
  days, then delete it. Do not store attachments. Persist only the link token
  needed by the test when possible.

Do **not** move CallCaster nameservers for this work. Nameserver delegation is
registrar configuration and does not help the SIM system. In stage 3, add a
small Cloudflare DNS-IaC module for the new non-production
`sip-sim.qa.callcaster.ca` A/AAAA record. In stage 7, extend the same module
with the `mail.qa.callcaster.ca` MX/TXT and Resend verification records. Import
no existing production record. Before stage 3, the platform owner confirms that
the `callcaster.ca` zone is in the current Cloudflare account and gives the CI
deploy identity zone-DNS edit permission. This is the only DNS access
prerequisite.

## Run control and evidence

Each SMS or call has a `simulation_run_id`, external ID, persona ID, provider
SID when present, and an ordered event timeline. The run controller records:

- expected and actual status/callback sequence;
- UI, worker, queue, database, and media timestamps;
- delivery, answer, failure, and retry counts; and
- p50/p95/p99 latency, queue delay, and cost.

Tasks can pause at named durable checkpoints. An agent reads the run API and
stable UI `data-testid` values, verifies the state, and releases the next
persona action. A checkpoint is not a Playwright sleep.

## Environment policy

| Environment | SIM tasks | SIP handler / routing | Scheduled or scale use |
|---|---|---|---|
| Local | Manual, against local app and worker | Local container or disabled | Small manual proof only |
| Dev | Manual and focused shared checks | Test workspace only; enabled by explicit environment config | Small scheduled smoke if isolated from developers |
| QA | Predefined regression flows | Public handler, dedicated Twilio test account/workspace | Scheduled Twilio-to-SIP canary |
| Production | No synthetic tasks or routing | Hard-disabled; resolver rejects synthetic mode | Never |
| GitHub-hosted runner | Task validation and provider-free checks only | No public SIP/RTP endpoint | No RTP load and no paid provider calls |
| Isolated synthetic environment | Predefined and manual remote runs | Dedicated handler, workspace, secrets, and spend cap | Required for canary and load |

Use a separate isolated synthetic environment for scheduled provider checks and
all load tests. Do not use the shared dev environment: a run can change data,
consume credits, and saturate workers. GitHub Actions may deploy or trigger an
approved run there, but the SIP handler and load generator run on controlled
infrastructure, not a GitHub-hosted runner.

## Implementation roadmap

The work is a sequence of small, independently useful changes. Do not start a
later stage until its acceptance check passes.

Every roadmap stage has four parts:

1. **Decision:** the choice that is fixed for this stage.
2. **Changes:** the files, services, or data that must be created or changed.
3. **Commands:** the command to run during implementation and verification.
4. **Completion test:** the evidence required before starting the next stage.

Commands marked **existing** already exist. Commands marked **add** are part of
the stage and must be implemented before that stage can pass. A failed
completion test stops the roadmap; do not continue by assuming the resource or
mapping works.

### 0. Roadmap prerequisites and gates

**Decision:** project-wide environment and secret management is ADR-0040, not
SIM-owned functionality. SIM implementation starts only after the ADR has a
reviewed Phase 1 config loader and Phase 2 dotenv provider.

**Changes:**

- Review and approve `docs/adr/0040-inherited-config-and-pluggable-secrets.md`.
- Complete ADR-0040 Phase 0 inventory and Phase 1 typed `ProjectConfig`.
- Complete ADR-0040 Phase 2 `SecretProvider` and local dotenv provider.
- Define the three initial SIM personas in the SIM catalog without adding an
  environment catalog under `e2e/sim/`.

**Commands:**

```bash
# existing: inspect current project state
npm run test:sim -- --help
npm run ci:local

# add in ADR-0040 before SIM implementation
npm run config:inventory
npm run config:show -- --environment sai-local
npm run secrets:required -- --environment sai-local --service sim
```

**Completion test:** the config command resolves `sai-local` without SIM
configuration, the secret command lists names without values, and the existing
SIM suite still has its documented current behavior. Record the resolved config
fingerprint and commit it as redacted evidence. Do not create
`e2e/sim/environments/`.

### 1. SIM persona catalog and profile POC

**Purpose:** replace the single fixed SIM identity with self-service, isolated
personas and role-aware profiles. This makes the existing paid SMS flow usable
by people and agents without duplicating account definitions per environment.

**Decision:** the checked-in SIM catalog owns logical personas, workspace names,
roles, capabilities, owned manifests, and allowed flows. ADR-0040 owns the
environment selected by `environmentName`. The database owns runtime IDs and
the reconciler owns live account/membership repair.

1. Add checked-in, non-secret persona definitions in `e2e/sim/personas/`.
   Define `person-a`, `person-b`, and `person-c` once. Each definition includes
   the workspace name, role, capabilities, owned persona-manifest keys, allowed
   flows, and email local-part. It contains no target environment, password,
   API key, phone number, or Twilio credential.
2. Consume the selected environment from ADR-0040's shared `ProjectConfig`.
   Do not add `e2e/sim/environments/` or duplicate base URLs, email domains,
   workspace markers, credential sources, or traffic policies in the SIM suite.
   The resolver combines the catalog persona with `ProjectConfig`:
   `person-a + dev → person.a@dev.callcaster.ca` and
   `person-a + sai-local → person.a@sai-local.callcaster.ca`.
3. Add a typed `ResolvedSimProfile` object. It contains the logical persona,
    environment, actor email, password reference, workspace name, runtime ID, actual
   verified role, capabilities, permitted flows, and traffic policy. All SIM
   tasks accept this object. Remove direct reads of `SIM_SENDER_*` from tasks.
4. Add `npm run sim:profile:ensure -- --persona <personaKey> --environment <environmentName>`.
   `personaKey` selects a catalog entry such as `person-a`. It determines the
   logical user, workspace name, role, capabilities, and owned manifests.
   `environmentName` selects the shared ADR-0040 `ProjectConfig` entry, such
   as `sai-local` or `dev`. It determines the base URL, email domain, secret
   provider, and traffic policy. Neither value is an arbitrary string supplied
   to create a new identity.
   - Local: create or repair the Better Auth user and workspace through a
     restricted bootstrap path; generate a password; write the result to
     `.sim/profiles/<environment>/<persona>.json` with mode `0600`.
   - Remote: use the same restricted bootstrap path with a CI or developer
     service credential. The account identity comes from the catalog and
     environment, never from command-line email input.
   - Production: the command exits before network activity.
5. Add `sim:profile:list` and `sim:profile:status`. They display persona,
   environment, email, workspace, role, expiry, and traffic policy. They never
   show a password or token. Add `sim:profile:check-access` to verify that the
   selected account has the roles and capabilities declared in the catalog.
6. Convert the current `npm run test:sim` flow to resolve a persona and
    environment, then pass one resolved profile through existing sign-in, credit,
    CSV, and SMS tasks. The initial `sai-local` behavior becomes a shared
    `ProjectConfig` selection plus a catalog persona, not a hard-coded persona.

**Commands:**

```bash
# add: validate the checked-in SIM catalog without network access
npm run sim:catalog:check

# add: create or repair one logical persona in one shared environment
npm run sim:profile:ensure -- --persona person-a --environment sai-local
npm run sim:profile:ensure -- --persona person-b --environment sai-local

# add: inspect state without changing it
npm run sim:profile:status -- --persona person-a --environment sai-local
npm run sim:profile:check-access -- --persona person-b --environment sai-local

# existing: run the paid SMS proof only after the profile checks pass
npm run test:sim
```

**Completion test:** run `sim:profile:ensure` twice for each persona. The second
run reports `reused` or `repaired`, not `created`. Confirm that both personas
use `SIM Workspace A`, have separate derived email addresses, and have the
correct `owner` and `member` memberships. Run the owner-only and member-level
access checks. Then run the existing headed SIM proof once:

```bash
npm run test:sim:headed
```

Capture the redacted profile status, access results, and SIM evidence. Stop if a
profile has the wrong role, workspace, or credential source.

**Credentials and access:** add one non-production-only service endpoint for
profile bootstrap. It accepts a narrow service credential, permits only catalog
 personas, the selected environment's email namespace, and workspace ownership
 marker,
assigns the catalog role, verifies capabilities, and writes an audit event.
Production does not register this endpoint or credential. A human user sees
only the browser login for their own generated persona. The endpoint cannot
request a different role or impersonate another catalog persona.

#### Persona definition and reconciliation

The checked-in catalog is the desired state. The CallCaster database is the
actual state. Do not use generated JSON files or copied workspace IDs as the
source of truth. Resolve workspaces by their exact catalog `workspaceName`, then
store the returned database ID only in the resolved profile for that run.

Example catalog shape:

```ts
export const simPersonas = {
  "person-a": {
    emailLocalPart: "person.a",
    workspaceName: "SIM Workspace A",
    role: "owner",
    capabilities: ["workspace.read", "billing.purchaseTestCredits", "simulation.manage"],
    ownsManifests: ["persona-a"],
    allowedFlows: ["sms-send", "voice-ivr"],
  },
  "person-b": {
    emailLocalPart: "person.b",
    workspaceName: "SIM Workspace A",
    role: "member",
    capabilities: ["workspace.read", "audience.write", "campaign.write", "message.send"],
    ownsManifests: ["persona-b"],
    allowedFlows: ["sms-send", "voice-ivr"],
  },
} as const;
```

The environment definition supplies only environment facts:

```ts
export const simEnvironments = {
  "sai-local": {
    baseUrl: "http://127.0.0.1:3000",
    emailDomain: "sai-local.callcaster.ca",
    workspaceMarker: "sim:sai-local",
    credentialSource: "local-file",
    providerTraffic: "paid-test-only",
  },
  dev: {
    baseUrl: "https://dev.callcaster.ca",
    emailDomain: "dev.callcaster.ca",
    workspaceMarker: "sim:dev",
    credentialSource: "github-environment",
    providerTraffic: "paid-test-only",
  },
} as const;
```

The account email is derived as
`<emailLocalPart>@<environment.emailDomain>`. The catalog workspace name is
used unchanged in every environment. This means `person-a` and `person-b` map
to the same `SIM Workspace A` in each environment, while their accounts remain
separate. The database ID is discovered after the workspace is found or
created; it is never checked into the catalog.

`ensure` reconciles in this order:

1. Validate the persona and environment keys against the checked-in catalogs.
2. Refuse production and refuse any email or workspace value supplied through
   command-line overrides.
3. Find or create the workspace by its exact name in the selected environment,
   and verify its SIM ownership marker before adopting it.
4. Find or create the user by the derived exact email address.
5. Find or create the membership for that user and workspace.
6. Set the membership to the catalog role, but never remove the last owner or
   modify a workspace that is not SIM-owned.
7. Verify the resulting role, capabilities, workspace name, environment marker,
   and allowed-flow policy.
8. Write an audit record containing desired state, actual state, and the
   reconciliation result. Never write the password.
9. Return the database IDs and credential reference as a `ResolvedSimProfile`.

The bootstrap path must be idempotent. A retry after a timeout must not create
a second user, workspace, or membership. Use database uniqueness for the
derived email and workspace name, and handle a concurrent create by rereading
the existing row. The workspace must carry an explicit SIM/environment marker;
the reconciler must refuse to adopt a matching name without that marker.

Mappings stay fresh through three checks:

- `sim:profile:ensure` reconciles before every run;
- `sim:profile:check-access` compares every catalog field with the live user,
  workspace, and membership; and
- a scheduled non-mutating `sim:profile:drift` command checks every declared
  persona in each enabled non-production environment and fails on missing,
  extra, wrong-role, wrong-workspace, disabled, or cross-environment accounts.

The drift command reports a repair plan. It does not change state. Only
`ensure` repairs state, and only for SIM-owned accounts and workspaces. A
profile that has been intentionally retired is removed from the catalog first;
the cleanup command then disables the account and deletes the SIM workspace
after its retention period. It never deletes an unmarked workspace.

#### Logical idempotency and resource discovery

Every provisioning task has two modes:

- `ensure`: find the existing matching resource or create it, then reconcile
  safe mutable fields;
- `assert`: find the resource and fail with a drift report if it is absent or
  differs. It never creates or changes anything.

The runner must not decide that a resource is new because a local artifact file
is missing. Local files are evidence only. Discovery always queries the selected
environment through the approved bootstrap/read API or the product UI task.

Use stable logical identities for every SIM-owned resource:

| Resource | Stable identity | Reuse rule |
|---|---|---|
| Persona account | `environment + logicalPersonaKey` | Reuse the exact derived email; repair the catalog membership only. |
| Workspace | `environment + workspaceName + SIM ownership marker` | Reuse only an exact name with the matching marker; fail on zero or multiple matches. |
| Audience/list | `environment + workspace + fixtureKey + fixtureVersion` | Reuse only when the stored content fingerprint matches. |
| Contact row | `run + externalId` | Reuse the existing imported contact; never create a duplicate row for the same run identity. |
| Simulation run | `environment + runKey` | Reuse an active, unexpired run; create a new run only when explicitly requested. |

The audience fixture key is declared by the flow, for example
`sms-single-recipient`. The upload task generates a deterministic list name and
CSV fingerprint from that key, persona, environment, and fixture version. It
does not use Playwright's test ID or the current timestamp as the identity.
The same upload task can therefore discover an existing list, compare its
fingerprint, and reuse it. If the fingerprint differs, it creates a new
versioned SIM list and reports the old list as stale; it never overwrites a
list that is not marked as SIM-owned.

Add a small SIM resource registry to the environment database, or an equivalent
bootstrap-service store, with:

```text
environment, resource_type, logical_key, fixture_version,
resource_id, content_fingerprint, ownership_marker, last_verified_at
```

The registry is an index, not the only source of truth. Every `ensure` reads the
registry, verifies the referenced live resource, and repairs or recreates the
index when needed. Every `assert` compares the registry and live resource. A
missing registry row does not permit duplicate creation when a marked live
resource can be found by its stable identity.

The runner reports one of `reused`, `created`, `repaired`, `drifted`, or
`blocked` for each resource. This gives an agent clear evidence that a task did
not silently create another account, workspace, or audience list.

For the current SIM tasks, the migration is explicit:

1. `sign-in` uses `ensure` for the selected persona, then verifies the resolved
   account and workspace before continuing.
2. `contact-list` changes from `SIM sai-local <testId>` to a deterministic
   fixture identity and performs discover-or-create reconciliation.
3. `credits` reads the existing balance first and purchases only the shortfall;
   repeated runs do not purchase credits when the balance is sufficient.
4. `sms` uses the discovered contact/list identity and refuses to send if the
   contact fingerprint or approved destination changed.
5. Every task records its resource decisions in the run result envelope.

**Acceptance check:** two developers resolve `person-a` and `person-b` in the
same environment, then run tasks. They use the correct distinct accounts and
workspace roles, do not edit `.env`, cannot read each other's credential file,
   and a Member (Agent) profile is refused by an Owner-only task before any browser action.

### 2. Task protocol and useful SMS flows

**Purpose:** make the SIM suite callable by an agent, not only by a single
Playwright test.

**Decision:** tasks are typed, composable operations. Each task declares access,
has explicit inputs and outputs, and reports resource decisions. Flows may use
only registered tasks. The runner selects personas before opening the browser;
tasks cannot switch to a stronger account.

#### Dependency: inherited configuration and secret providers

The project-wide configuration migration is defined in
[ADR-0040](adr/0040-inherited-config-and-pluggable-secrets.md). It is a separate
cross-cutting work stream with its own incremental roadmap and documentation
updates. Do not implement a SIM-specific environment-variable, dotenv-loading,
or password-manager system.

SIM may start task extraction after ADR-0040 Phase 1 provides a validated
non-secret `ProjectConfig` and Phase 2 provides the `SecretProvider` interface
with the dotenv provider. SIM adopts the password-manager provider when
ADR-0040 Phase 5 reaches SIM. Until then, `e2e/sim/config.ts` remains a
compatibility adapter only; it must not gain new environment definitions or
direct `process.env` reads.

1. Define a task result envelope: `runId`, `task`, `status`, typed output,
   checkpoint name, redacted artifact paths, and failure code.
2. Give each task one input contract and one output contract. Do not let a task
   read hidden global state except the resolved profile and run context.
3. Extract the current steps into task modules: sign-in, credits, CSV build,
   CSV upload, campaign create, campaign launch, wait-for-status, UI metric
   read, and artifact collection.
   The existing task files are the migration units: `tasks/sign-in.ts`,
   `tasks/contact-list.ts`, `tasks/credits.ts`, and `tasks/sms.ts`.
4. Add `requiredAccess` metadata beside each task implementation. For the
   current tasks, declare `sign-in` as `workspace.read`, `contact-list` as
   Member (Agent) plus `audience.write`, `credits` as Owner plus
   `billing.purchaseTestCredits`, and `sms` as Member (Agent) plus `message.send`.
   The task function receives the already-selected profile and does not select
   a stronger account itself.
5. Add `sim:run -- --persona <personaKey> --environment <environmentName> --flow <flowName>`.
   The persona and environment names use the catalogs described in Step 1. A
   flow is checked-in code that composes tasks. The CLI permits only registered
   flow names.
6. Add two first flows: `sms-send` and `sms-failure-retry`. The latter proves
   that a known provider failure reaches the expected UI and retry state.
7. Use stable `data-testid` selectors for UI facts. Store screenshots, URLs,
   task JSON, and redacted logs under `.sim/runs/<run-id>/`.

**Commands:**

```bash
# add: validate task metadata and registered flows
npm run sim:tasks:check
npm run sim:flows:list

# add: run the first two flows
npm run sim:run -- --persona person-b --environment sai-local --flow sms-send
npm run sim:run -- --persona person-b --environment sai-local --flow sms-failure-retry

# existing: run the full repository gate after task changes
npm run ci:local
```

**Completion test:** run `sms-send` twice with the same fixture. Confirm the
second run reuses the account, workspace, audience, and contact when the
fingerprints match. Run the flow with only `person-b` and confirm the owner-only
credit task fails before browser navigation. Confirm `.sim/runs/<run-id>/`
contains task results, resource decisions, and redacted evidence. Confirm no
task reads `process.env` directly and no task calls Twilio directly.

**Acceptance check:** an agent can run either flow twice, stop after CSV
upload, report the campaign and queue values, then continue. The second run
reuses the same persona account, workspace, audience fixture, and contact when
their fingerprints match. The runner selects `person-b` for the Member
(Agent) tasks and `person-a` for the Owner credit task. If the flow is
configured with only `person-b`, it fails with a clear missing-access error
before opening the browser. No task needs direct Twilio API access.

### 3. SIP persona service POC

**Purpose:** prove deterministic SIP/RTP behavior before CallCaster routes any
call to it.

**Decision:** Asterisk on the dedicated Hetzner VPS is the shared SIP persona
service. SIPp is reserved for later load generation. The first proof uses one
recorded `hello-hangup` persona, TLS/SRTP, and no retained audio.

1. Confirm the Cloudflare-zone access stated above. Add the minimal DNS-IaC
   module and create `sip-sim.qa.callcaster.ca` for the handler address. This
   is the only infrastructure prerequisite for the POC.
2. Deploy one dedicated Ubuntu LTS virtual machine in the same region as QA.
   Use Docker Compose with three containers: Asterisk 22 LTS for SIP/RTP,
   `persona-controller` for manifest and event control, and Caddy for the
   controller HTTPS API. Use a private admin path such as WireGuard or the
   hosting-provider console; do not expose Asterisk management ports publicly.
3. Configure `sip-sim.qa.callcaster.ca` with a certificate valid for that host.
   Expose SIP TLS on TCP 5061 and the minimum UDP RTP range, initially
   10000-10100. Deny all other inbound ports except HTTPS and private
   administration. Enable SIP digest authentication and SRTP.
4. Store the handler SIP user/password and handler-to-CallCaster event token as
   GitHub environment secrets. The deploy workflow writes them to a root-only
   host file that Docker Compose mounts read-only. They are separate from
   Twilio credentials. Rotate them by updating the secret and restarting the
   handler through the same workflow.
5. Add a versioned manifest with one `hello-hangup` persona. The controller
   validates a run ID, directs Asterisk to answer, plays a checked-in WAV asset,
   waits two seconds, then hangs up. It posts signed events for invite, answer,
   playback start/end, and hangup.
6. Test it first with a local SIP client using the handler DNS name, TLS, SRTP,
   and digest authentication. Capture only RTP statistics and event timestamps.
   Do not retain call audio in the POC.
7. Add `no-answer`, `silent-answer`, and `dtmf-1` only after the first persona
   works. Asterisk, not SIPp, is the shared persona service. Keep SIPp for the
   later load generator.

**Resolved hosting choice:** use a small dedicated Hetzner Cloud VPS, not
Railway and not a GitHub runner. It needs public UDP RTP and long-lived SIP
processes. Do not deploy a PBX product or add a media server in this stage.

**Acceptance check:** a SIP client completes the `hello-hangup` scenario over
TLS/SRTP, receives the audio, and the controller has the complete signed event
timeline.

**Commands and completion test:**

```bash
# add: validate the handler container and persona manifest
npm run sip:handler:build
npm run sip:manifest:check

# add: deploy and inspect the dedicated host
npm run sip:handler:deploy -- --environment qa
npm run sip:handler:status -- --environment qa

# add: run a direct SIP client proof; this must not use Twilio
npm run sip:handler:smoke -- --persona hello-hangup --transport tls-srtp
```

The smoke must show one authenticated invite, answer, RTP playback, and
hangup, with matching signed controller events. Run the manifest check and
smoke after every handler image or audio change. Do not begin audience binding
until the smoke passes from a clean client.

### 4. Simulation runs, personas, audiences, and identities

**Purpose:** bind a real CallCaster contact to a tested SIP behavior without
adding SIP detail to product contact data.

**Decision:** `External ID` binds an uploaded contact to a run persona. The
contact remains an ordinary CallCaster contact. The run manifest and resource
registry hold the test metadata. Mixed audiences default to blocked unless a
contact is synthetic-bound or explicitly approved for PSTN.

1. Add `simulation_run`, `simulation_persona_binding`, and
   `simulation_event` records. A run has an owner profile, target environment,
   expiry, manifest version, and allowed flow. A binding has a run ID, contact
   external ID, persona ID, and state. It never stores a SIP URI in the contact.
2. Add a controller API that creates a run before the CSV is generated. It
   produces external IDs in the form `sim-<run-id>-<persona>-<sequence>`.
3. Generate a normal CallCaster CSV with those external IDs and normal synthetic
   E.164 values. Upload it through the existing UI for all audience-import
   flows. Record imported contact IDs against the bindings after import.
4. Make mixed audiences explicit: each contact is `synthetic-bound`,
   `approved-pstn`, or `blocked`. Default is `blocked`. A SIM campaign refuses
   to start if it contains a blocked contact. A normal campaign has no SIM run
   and behaves exactly as it does today.
5. Use catalog-persona users and environment-resolved workspaces. Local
   credentials use the generated address, such as
   `person.b@sai-local.callcaster.ca`; remote credentials use
   `person.b@dev.callcaster.ca` or `person.b@qa.callcaster.ca`. The same
   logical persona is therefore available in every environment without
   separate persona declarations. Normal login stays database-seeded and does
   not depend on mail.
6. Reserve remote email-flow work for stage 7. It is not a prerequisite for
   voice work.

**Acceptance check:** a developer creates one run, uploads a mixed CSV, and can
prove which contacts are synthetic-bound, approved for real PSTN, or blocked.
No API, import, export, or contact row contains a SIP address.

**Commands and completion test:**

```bash
# add: validate manifest, audience fixture, and registry schema
npm run sim:manifest:check
npm run sim:fixtures:check
npm run sim:registry:check

# add: create or reuse the run and upload its audience through the UI task
npm run sim:run:create -- --persona person-a --environment qa --run-key mixed-audience
npm run sim:run -- --persona person-b --environment qa --flow audience-mixed
```

Run `audience-mixed` twice. The second run must report the same list and contact
resource IDs with matching fingerprints. Change one fixture value and rerun; it
must create a new versioned SIM list and mark the old list stale. Assert that a
blocked contact prevents campaign start before any provider call.

### 5. Destination resolver and isolated provider path

**Purpose:** send only bound test contacts through Twilio to the SIP persona
service while preserving all normal production call behavior.

**Decision:** one server-side resolver at the existing Twilio boundary is the
only SIP routing decision point. It fails closed. It returns SIP only for a
non-production, enabled, authorized run with a matching binding. It never falls
back from a rejected synthetic contact to real PSTN.

1. Inventory every current Twilio `calls.create` path. Route each through the
   existing shared telephony boundary before enabling synthetic mode. Add a guard
   that fails CI if a new direct call creation bypasses that boundary.
2. Add `resolveTelephonyDestination(contact, simulationRun)` there. It returns
   a phone number by default. It returns
   `sip:<persona>@sip-sim.qa.callcaster.ca;secure=true` only when all checks
   pass: non-production environment, `SIM_TELEPHONY_ENABLED=true`, live
   authorized run, matching bound external ID, and handler configuration.
3. Set Twilio `SipAuthUsername` and `SipAuthPassword` only for the SIP result.
   Pass the non-secret run ID in a SIP header. The handler uses its authenticated
   controller API to validate that run and persona before it answers. It rejects
   unknown, expired, or mismatched runs.
4. On a synthetic run, reject an unbound contact unless it is in the immutable,
   profile-owned approved-PSTN list. Default list is empty. Log the rejection as
   a simulation event. Never silently fall back to real PSTN.
5. Provision the isolated QA workspace, Twilio subaccount, Twilio API key,
   caller ID, handler secrets, and strict Twilio spend/concurrency alerts. Set
   the resolver's handler secrets as Railway environment variables and the same
   handler-side values as GitHub environment secrets for deployment. Use a
   different workspace and subaccount from shared development activity.
6. Add DNS-IaC drift checks. The stage-3 SIP hostname must already exist; do
   not change nameservers. Reserve mail DNS records for stage 7.
7. Run the first end-to-end case: CallCaster task starts an IVR campaign;
   CallCaster calls Twilio; Twilio reaches the handler; CallCaster's `<Play>`
   is heard by the persona; the handler replies and hangs up; callbacks update
   the run timeline and UI.

**Acceptance check:** this flow completes in the isolated environment. A call
without a valid run is rejected before Twilio. The same application path in
production cannot produce a SIP URI even if a database row is altered.

**Commands and completion test:**

```bash
# add: inventory and guard all Twilio call creation paths
npm run telephony:call-paths:check
npm run telephony:resolver:check

# add: validate isolated provider configuration without making a call
npm run sim:provider:check -- --environment qa

# add: run the one-call end-to-end proof
npm run sim:run -- --persona person-a --environment qa --flow voice-ivr
```

Before enabling the resolver, run the resolver check with synthetic mode off and
prove that ordinary destinations are unchanged. Then run invalid-run,
unbound-contact, production, and valid-bound-contact cases. Only the final case
may reach Twilio. Save the Twilio SID, handler events, CallCaster callbacks,
and redacted UI result. Repeat after every call-path inventory change.

### 6. Voice tasks and predefined SIM flows

**Purpose:** turn the provider path into reusable agent tools and product
behavior checks.

**Decision:** IVR and recorded RTP flows come first. The CallCaster TwiML path
provides caller audio and the SIP handler provides callee audio. Browser-agent
virtual microphone flows are deferred until the IVR path is stable.

1. Add tasks for simulation-run creation, persona checkpoint release, campaign
   launch, live dial, IVR start, event-timeline wait, UI metric read, and
   artifact collection.
   Declare their access in the task metadata: run creation and checkpoint
   release require Owner plus `simulation.manage`; campaign launch requires
   Member (Agent) plus `campaign.write`; live dial and IVR start require Member
   (Agent) plus `call.start`; timeline and UI reads require Member (Agent) plus
   `simulation.read`;
   artifact collection requires `simulation.read` and never requires Owner.
2. Add durable handler checkpoints. A persona can answer and wait for a signed
   release from the controller. The task polls the run timeline, inspects UI,
   then releases it. Do not use fixed browser sleeps.
3. Add IVR flows first. CallCaster provides caller audio through its normal
   TwiML `<Play>`; Asterisk provides the callee recording or DTMF. The test
   runner only operates CallCaster tasks.
4. Add browser-agent speech only after IVR flows work. The task launches the
   normal Voice SDK client with a virtual microphone/synthetic WebRTC track.
   The audio asset is versioned with the persona manifest. The runner still
   never calls Twilio directly.
5. Add checked-in flows for voicemail, no answer, DTMF navigation, live-call
   audio, callback, billing debit, queue completion, and retry.

**Acceptance check:** an agent runs one named voice flow, pauses at a durable
checkpoint, reports the UI and event values, releases the checkpoint, and
returns a redacted result bundle.

**Commands and completion test:**

```bash
# add: validate voice task contracts and checkpoint manifests
npm run sim:voice:check
npm run sim:checkpoints:check

# add: run each deterministic voice flow
npm run sim:run -- --persona person-a --environment qa --flow voice-ivr
npm run sim:run -- --persona person-b --environment qa --flow voice-dtmf
npm run sim:run -- --persona person-b --environment qa --flow voice-no-answer
```

Pause one flow at its named checkpoint, inspect the UI and timeline, release it,
and verify the expected callback and billing/queue result. The completion test
must prove that releasing the checkpoint, not elapsed time, advances the
persona.

### 7. Remote email checks and scheduled QA smoke

**Purpose:** add only the remote dependencies that a scheduled behavior check
needs.

**Decision:** remote inbound mail uses the approved Cloudflare Email Worker and
run API. It is added only for an email-specific flow. The first scheduled smoke
uses one call or one SMS, one concurrent run, and no campaign volume.

1. Deploy the Email Routing Worker and test-mail API described above if an
   invite, reset-password, or verification flow is selected. Test its recipient
   validation, seven-day deletion, and rejection of non-SIM mail.
2. Add one scheduled, low-cost QA flow. Start with a single SMS or a single
   `hello-hangup` SIP call, not a campaign.
3. Put limits in code and provider configuration: one concurrent run, one
   concurrent call, 60-second maximum duration, daily call cap, monthly spend
   alert, and automatic cleanup of expired profiles/runs.
4. GitHub Actions may invoke the checked-in flow after an approved deployment.
   It passes only a short-lived service credential. The SIP handler and RTP
   remain on the VPS.
5. Alert on bootstrap failure, callback absence, wrong event order, media
   failure, cost-limit breach, and expired-resource cleanup failure.

**Acceptance check:** a scheduled run creates its own profile, completes, emits
one report, cleans its resources, and cannot run against production.

**Commands and completion test:**

```bash
# add: validate mail routing and recipient isolation
npm run sim:mail:check -- --environment qa

# add: execute the scheduled flow locally in dry-run mode
npm run sim:schedule:run -- --environment isolated-sim --dry-run

# add: execute one approved provider smoke
npm run sim:schedule:run -- --environment isolated-sim --flow voice-ivr
```

Run the mail check with a valid SIM address, an invalid SIM address, and a
non-SIM address. Only the valid address may be stored. Run the scheduled smoke
twice and verify profile creation, one report, cleanup, limits, and no
production access. Inspect alerts before enabling the schedule.

### 8. SIP load testing

**Purpose:** measure capacity without turning real-provider testing into a load
generator.

**Decision:** SIPp runs on controlled disposable Linux workers against Asterisk
only. Twilio is used for a separate one-call smoke, never for load volume.

1. Run SIPp from disposable Linux workers against the persona service. Use the
   same versioned audio assets and SIP credentials, but do not involve Twilio.
2. Define versioned profiles for call rate, concurrency, duration, RTP asset,
   and DTMF pattern. Start at one call per second and increase in reviewed
   steps.
3. Collect SIPp success/error counts, RTP loss/jitter, handler CPU/memory,
   network ports, event delay, database pool use, and worker queue depth.
4. Stop automatically on an agreed error rate, p95 event latency, RTP-loss,
   CPU, memory, queue, or database-pool threshold. Save a machine-readable
   report and redacted logs.
5. Run a separate small Twilio-to-SIP smoke after handler changes. Never use
   Twilio calls for the load volume.

**Acceptance check:** a load profile can be repeated from a clean worker and
produces comparable reports, while the isolated CallCaster environment remains
within its safety thresholds.

**Commands and completion test:**

```bash
# add: validate a versioned load profile and worker image
npm run sip:load:check -- --profile hello-hangup-1cps
npm run sip:load:run -- --profile hello-hangup-1cps --clean-worker

# add: compare two reports and run the separate provider smoke
npm run sip:load:compare -- --baseline <report> --candidate <report>
npm run sim:run -- --persona person-a --environment isolated-sim --flow voice-ivr
```

The load run must stop on configured error, RTP-loss, latency, CPU, memory,
queue, or database thresholds. It must produce a machine-readable report. Run
the same profile twice from clean workers and compare the reports before
increasing call rate or concurrency.
