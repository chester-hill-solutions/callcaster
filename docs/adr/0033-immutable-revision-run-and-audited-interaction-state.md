# Immutable Script Revision, Campaign Run, and audited Interaction state

Interactive messaging requires that history never silently changes. The current Campaign
row mixes reusable configuration with execution status, and Script stores only mutable
`steps` JSON with no revision or published snapshot. We adopt an immutable-execution model:
a Script is the stable authored identity with a mutable draft; each publish
creates a monolithic immutable `Script Revision` pinned by a Campaign Run; and Campaign is
reusable configuration while a first-class `Campaign Run` is an immutable snapshot
(audience Queue Entries, sender, sending windows, Script Revision, disclosure/jurisdiction
policy, and reserved continuation credits). An `Interaction` — one Contact executing one
Revision — is modeled as an authoritative transactional state machine plus an append-only
semantic `Interaction Event` stream used for audit and reconstruction (not full event
sourcing). The universal Run/Revision/Interaction model is adopted in phases; release one
applies it only to new interactive message campaigns, leaving existing calls/IVR on the
legacy model until a separate migration.

## Considered Options

- **Full event sourcing.** Strongest replay/debugging, but imposes event-schema evolution,
  replay tooling, and PII-retention obligations on every operational detail. Rejected in
  favor of an authoritative state machine with an event audit.
- **Mutable Campaign-as-execution.** Rejected: relaunch and analytics would depend on
  mutating history and on whichever Revision was current at dispatch (ambiguous for
  in-flight work).
- **Per-run document snapshot without a Revision entity.** Rejected: no reusable,
  reconcilable, reassignable immutable artifact.

## Consequences

Schema adds `script_revision`, `campaign_run`, `interaction`, `interaction_event`,
`interaction_effect`; `campaign_queue` gains `run_id` with uniqueness `(run_id, contact_id)`.
All tenant-scoped tables register under ADR-0004; routes use `createTenantDb`. A pure
reducer produces deterministic effects with stable IDs; effects never write state; the
transition service is the single writer. No triggers/DB behavior (ADR-0006); narrow
PL/pgSQL only for queue claim and credit reservation (ADR-0003).

## References

- `app/db/schema.ts` (campaign, campaign_queue, script, message)
- `docs/interactive-sms-delivery-plan.md`
- ADR-0015 (domain IDs), ADR-0003, ADR-0004, ADR-0006
