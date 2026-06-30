# Railway schema transform (Phase 1)

**Run only against Railway review Postgres** ([`visual-asset-review`](../docs/railway-review-env.md)). Do not apply to hosted Postgres prod.

**Status on review (2026-06-29):** steps 00–05, 01c, 02/02b, 03/03a/03b, 08/08b applied. Sketches 06, 07, 09 pending. Baseline: [`drizzle/0000_baseline.sql`](../../drizzle/0000_baseline.sql).

## Apply order

| Step | File | Summary |
|------|------|---------|
| 00 | [`00-preflight.sql`](./00-preflight.sql) | Extensions, session settings |
| 01 | [`01-drop-vestigial.sql`](./01-drop-vestigial.sql) | Drop vestigial tables |
| 01c | [`01c-drop-audience-trigger.sql`](./01c-drop-audience-trigger.sql) | Drop `contact_change` trigger + audience fn |
| 02 | [`02-consolidate-campaign.sql`](./02-consolidate-campaign.sql) | Add unified campaign columns |
| 02b | [`02b-backfill-campaign.sql`](./02b-backfill-campaign.sql) | Backfill + drop subtype tables |
| 03 | [`03-normalize-campaign-queue.sql`](./03-normalize-campaign-queue.sql) | Backfill `queue_state` columns |
| 03a | [`03a-rewrite-queue-rpcs.sql`](./03a-rewrite-queue-rpcs.sql) | RPCs without `campaign_queue.status` |
| 03b | [`03b-drop-queue-status.sql`](./03b-drop-queue-status.sql) | Drop `campaign_queue.status` |
| 04 | [`04-contact-prune.sql`](./04-contact-prune.sql) | Drop contact legacy columns |
| 05 | [`05-drop-rcs-onboarding.sql`](./05-drop-rcs-onboarding.sql) | RCS no-op at DDL |
| 08 | [`08-household-key.sql`](./08-household-key.sql) | Create/repair `households` table |
| 08b | [`08b-household-backfill.sql`](./08b-household-backfill.sql) | Backfill 117k households from address |
| 10 | [`10-verify.sql`](./10-verify.sql) | Read-only validation |

## Sketches (manual / later phases)

| Step | File | When |
|------|------|------|
| 06 | [`06-adr-0015-call-message.sql`](./06-adr-0015-call-message.sql) | After billing key migration |
| 07 | [`07-split-workspace-twilio-data.sql`](./07-split-workspace-twilio-data.sql) | After app reads typed twilio tables |
| 09 | [`09-drop-legacy-presence.sql`](./09-drop-legacy-presence.sql) | After Phase 3B SSE |

## Run

```bash
railway environment visual-asset-review
railway service "PostgreSQL 18"
bash scripts/schema-transform/apply-all.sh   # uses DATABASE_PUBLIC_URL via railway run
```

Or:

```bash
railway run -- bash -lc 'bash scripts/schema-transform/apply-all.sh'
```

## Baseline squash

```bash
railway run -- bash -lc 'bash scripts/schema-transform/dump-baseline.sh'
drizzle-kit introspect   # regenerate app/db/schema.ts
mv client/migrations/*.sql docs/archive/client-migrations/
```

## References

- [`docs/client-postgres-migration-plan.md`](../../docs/client-postgres-migration-plan.md)
- [`docs/railway-review-env.md`](../../docs/railway-review-env.md)
