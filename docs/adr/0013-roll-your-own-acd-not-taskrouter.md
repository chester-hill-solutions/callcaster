# Roll-your-own ACD on Twilio Queues + Conferences, not TaskRouter

Inbound ACD is built on Twilio Voice Queues + conference-per-entry (`acd-{queueEntryId}`) + a self-chaining router tick (modeled on `queue-next` campaign dispatch). Avoids Twilio TaskRouter's per-task pricing, second source of truth, and webhook surface that duplicates what `campaign_queue` + the queue-next tick pattern already prove out. Postgres is the single source of truth for queue entries and agent state; pg-realtime drives the agent desktop and wallboard. The router tick moves to the Bun worker in v2 (ADR-0007/0009).

## References

- `docs/contact-center-platform-plan.md:19-23`, `supabase/migrations/20260610215000_inbound_queue_routing.sql:199` (`claim_inbound_queue_entry`), `supabase/functions/acd-router/index.ts`
