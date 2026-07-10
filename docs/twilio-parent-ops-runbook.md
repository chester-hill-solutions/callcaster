# Twilio parent-account ops runbook (Phase H)

Manual, ops-only checks for the Twilio **parent** account and Console-side settings
that CallCaster's per-workspace subaccounts (`docs/adr/0011-twilio-subaccount-per-workspace.md`)
depend on but cannot fully automate via the REST API. Read this before onboarding a
new workspace to production, and before flipping a workspace from A2P/Trust Hub
`in_review` to sending live compliance-gated traffic.

## 1. Canada (CA) geographic permissions

CallCaster onboarding supports `operatingCountry: "CA" | "US" | "BOTH"`
(`WORKSPACE_OPERATING_COUNTRY_VALUES` in `app/lib/types.ts`). Twilio subaccounts do
not always inherit the parent account's **Geographic Permissions** the same way for
every product:

- **Voice**: Console → *Voice* → *Settings* → *Geo Permissions* — confirm Canada is
  enabled for the subaccount (or the parent, if the subaccount defers to it) before
  a CA workspace can dial or receive calls from Canadian numbers. A workspace with
  `operatingCountry` including `"CA"` but no CA voice geo-permission will see calls
  fail silently at the carrier level — this does not show up as a webhook drift or
  an onboarding-state error, so it must be checked manually per new workspace.
- **SMS**: Console → *Messaging* → *Settings* → *Geo Permissions* — same check for
  SMS to/from Canadian numbers.
- **Number provisioning**: purchasing a Canadian number
  (`app/lib/platform-workspace-numbers.server.ts`) requires the subaccount to already
  have CA number-purchasing enabled; this is a separate toggle from the geo
  permissions above.

**Ops step**: before marking any CA/BOTH workspace's onboarding as `live`, verify all
three toggles in Twilio Console for that workspace's subaccount SID (found in
`workspace.twilio_data.sid` / the admin Twilio portal's Subaccount panel).

## 2. Primary Customer Profile (Trust Hub)

Every Twilio **account** (not subaccount) needs exactly one **Primary Customer
Profile** approved at the parent-account level before any subaccount's **Secondary
Customer Profile** (the one CallCaster provisions per workspace via
`app/lib/twilio-trusthub.server.ts`) can be submitted for review. This is a
one-time, parent-account-level Console step:

1. Console → *Trust Hub* → *Customer Profiles* → confirm a Primary Customer Profile
   exists and its status is `twilio-approved`.
2. If none exists yet, create and submit one for the parent business entity before
   any workspace's A2P 10DLC or toll-free verification path will move past
   `submitting`.
3. This is a prerequisite, not something CallCaster's compliance job
   (`app/lib/twilio-compliance-job.server.ts`) can create or detect — a Secondary
   Customer Profile submitted with no approved Primary Customer Profile will sit in
   Twilio's own review queue indefinitely, and CallCaster's `reviewState` has no way
   to distinguish that from ordinary review latency.

## 3. `TWILIO_COMPLIANCE_NOTIFY_EMAIL` (optional)

`app/lib/twilio-compliance-notify.server.ts` sends an internal ops-alert email
(via Resend) when a Trust Hub bundle needs documents/manual action, or when the
`workspace_twilio_compliance` job terminally fails. As of Phase H this env var is
**optional**:

- If unset, `sendComplianceOpsAlert()` logs
  `twilio.compliance.notify.skipped_no_recipient` and returns `{ sent: false }`
  without throwing — no alert email is sent, but nothing breaks.
- Because alerting is silent-by-default when unset, ops must instead rely on the
  admin Compliance panel (`AdminTwilioPortal.CompliancePanel.tsx`, wired into the
  per-workspace Twilio admin page) to spot workspaces with a "Documents / manual
  action needed" flag, or on log search for `twilio.compliance.notify.skipped_no_recipient`
  / `worker.handler.twilio_webhook_audit.drift_detected` to confirm the sweep is
  actually running.
- **Recommendation**: set `TWILIO_COMPLIANCE_NOTIFY_EMAIL` in production so
  action-needed alerts are proactive rather than requiring someone to open the
  admin panel per workspace.

## 4. `TWILIO_TRUSTHUB_SECONDARY_POLICY_SID` — placeholder, MUST confirm before go-live

`app/lib/twilio-trusthub.server.ts` hardcodes a **placeholder** default Trust Hub
policy SID for Secondary Customer Profiles:

```
DEFAULT_SECONDARY_CUSTOMER_PROFILE_POLICY_SID = "RNdfbf3fXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

This is not a real SID — it is a stand-in until confirmed against Twilio Console.
**Before any workspace's Trust Hub bundle is submitted for review in production**:

1. In Twilio Console → *Trust Hub* → *Policies*, find the actual "Secondary
   Customer Profile" policy SID for the account (this can vary by Twilio account
   region/type).
2. Set `TWILIO_TRUSTHUB_SECONDARY_POLICY_SID` in the environment to that real SID —
   `resolvePolicySid()` prefers the env var over the placeholder default.
3. If this is left unset with the placeholder in place, bundle creation will
   either fail outright or (worse) silently attach the wrong policy, which only
   surfaces once Twilio's own review rejects the submission (Phase C/D territory,
   not something the webhook audit or compliance job can detect ahead of time).

## 5. Admin Compliance panel and retry action (Phase H)

- The admin Twilio portal (`/admin/workspaces/:workspaceId/twilio`) now has a
  **Compliance** panel showing A2P 10DLC status, Trust Hub bundle/trust product
  SIDs, toll-free verification block state, and a derived "documents needed" flag
  (computed from `a2p10dlc.rejectionReason`, `reviewState.blockingIssues`, and
  `emergencyVoice.complianceNotes` — no new schema field was added).
- **"Retry compliance job"** button dispatches the `retry_compliance_job` admin
  action, which calls `enqueueWorkspaceComplianceJob(workspaceId, "admin_retry")`.
  This is idempotent — it no-ops if a `workspace_twilio_compliance` job is already
  queued/running for the workspace — so it is safe to click repeatedly.
- The panel links to the Twilio Console Trust Hub Customer Profiles page for manual
  document upload/review; CallCaster does not have API access to that step.

## 6. Scheduled webhook audit (Phase H)

A new self-re-enqueuing job type, `twilio_webhook_audit`, runs in the Bun worker
(`app/lib/worker/handlers.server.ts`, `jobHandlers.twilio_webhook_audit`):

- Loops every non-disabled workspace with Twilio subaccount credentials, calls
  `auditWorkspaceTwilioWebhooks` (drift detection against canonical `/api/*` URLs),
  and — unless the job's `params.autoRepair` is explicitly `false` — auto-repairs
  drift via `repointWorkspaceTwilioWebhooks`.
- When a workspace's webhooks were actually repointed, it also triggers a
  `twilio-open-sync` sweep for that workspace so locally-cached call/message status
  catches up.
- One workspace's failure (e.g. revoked/missing Twilio credentials) is logged
  (`worker.handler.twilio_webhook_audit.workspace_failed`) and skipped — it does
  not abort the sweep for the rest of the workspaces.
- Re-enqueues itself ~6 hours out after each run (`TWILIO_WEBHOOK_AUDIT_RESCHEDULE_MS`),
  the same self-scheduling pattern `low_credit_notify` uses: a fresh `queued` row
  with a future `retry_at`, which `claimNextJob`'s `retry_at IS NULL OR retry_at <=
  now()` filter treats as "not due yet."

### Seeding the first `twilio_webhook_audit` row

Like `low_credit_notify`, this job type has **no pg_cron entry and nothing in the
codebase inserts its first row automatically** — the self-re-enqueue logic only
takes over once a row exists. **Ops step**: seed the first row once, manually, e.g.:

```sql
insert into job (type, status, params)
values ('twilio_webhook_audit', 'queued', '{}'::jsonb);
```

Run this once against the production database (or via an admin one-off script) after
deploying Phase H. After that, the worker's self-re-enqueue keeps the sweep running
indefinitely without further ops intervention, as long as the Bun worker process
(`worker/index.ts`, long-running mode) stays up.
