# Drizzle + postgres driver, hybrid with plpgsql RPCs

Drizzle ORM for all CRUD/queries/joins — end-to-end TypeScript types via `InferSelectModel`/`InferInsertModel` (fixes "low type adoption" debt). Claim/lease/dequeue concurrency logic stays as plpgsql RPCs (`FOR UPDATE SKIP LOCKED` + atomic claim→update→return), called via `db.execute(sql\`select claim_campaign_queue_contacts(...)\`)` with typed wrappers. Rewriting proven concurrency in a query builder re-introduces race conditions the RPCs were written to eliminate. The SQL that goes is trigger magic and untyped CRUD, not concurrency primitives. All Drizzle queries live in repository files (`app/server/repositories/*.repo.ts`); routes never call `db` directly. Cross-workspace authz is embedded in `UPDATE WHERE` via `exists()` subquery — atomic authz + update.

## Considered Options

- **Pure Drizzle, rewrite all RPCs as TS transactions** — re-implements proven concurrency, risks subtle races on the claim+update+return path.
- **Raw pg driver, no ORM** — re-implements type generation and migrations by hand.

## References

- `supabase/migrations/20260521140000_queue_state_and_claim.sql:74` (`claim_campaign_queue_contacts`), `supabase/migrations/20260610215000_inbound_queue_routing.sql:199` (`claim_inbound_queue_entry`), `supabase/migrations/20260415120000_add_dequeue_fields.sql:19` (`dequeue_contact`)
- quick-canvass `app/db/schema.ts` (full Drizzle schema), `app/server/repositories/*.repo.ts` (repository pattern), `app/server/db.ts` (shared postgres pool + Drizzle client)
