# Recipient Messaging Consent ledger and fail-closed disclosure for automated SMS

Automated SMS must carry enforceable consent evidence and recipient-facing disclosure.
A single `contact.opt_out` boolean cannot represent consent source, scope, or proof, and
Twilio's Messaging Policy (2026) requires prior consent plus proof, initial opt-out
language, and sender identification in every message except ongoing-conversation follow-ups.
We adopt a recipient-level, append-only `Messaging Consent` ledger (grant, STOP revocation,
START opt-in, import evidence, and audited override) as the authoritative eligibility
source; Contact `opt_out` remains only a compatibility projection during rollout. Inbound
STOP terminates all applicable Contact Interactions workspace-wide and suppresses pending
sends in the same transaction; only recipient START (never a simulated UI/API control)
restores eligibility. Automated messaging is fail-closed: strict publish requires sender
identity, initial opt-out disclosure (tracked per Workspace–recipient), jurisdiction
authorization evidence, consent policy per outbound transition, reachable terminals, and no
unbounded loops. CallCaster provides controls and evidence, not a guarantee that any
template confers legal compliance.

## Considered Options

- **Contact-global opt-out boolean + email-style unsubscribe.** Rejected: no consent proof,
  no scope, no audit, and fails the carrier proof-of-consent requirement.
- **Profile-based per-jurisdiction minimum.** Allows lower safeguards for political
  exemptions but complicates policy and risks carrier/compliance exposure when message
  subject changes. Rejected; universal fail-closed standard selected.
- **Run-level testimonial attestation without per-recipient record.** Rejected: weaker
  per-recipient proof and larger Workspace compliance burden.

## Consequences

`recipient_consent_event` (append-only) + `recipient_consent` (maintained projection, no
trigger). STOP becomes a high-priority, fail-closed command. Disclosure split: initial
opt-out per Workspace–recipient; sender identity in each Run opener plus jurisdiction
authorization. Exact STOP/START handling stays deterministic and precedes any model
classification. Sensitive political actions require exact intent + confirmation + human
approval regardless of model confidence.

## References

- `app/db/schema.ts` (contact opt_out), `app/lib/chat-opt-out.ts`
- `app/routes/api+/inbound-sms.action.server.ts`
- `docs/interactive-sms-delivery-plan.md`
