# pg-realtime: SSE + workspace_events + LISTEN/NOTIFY

All three Supabase Realtime features (postgres_changes, presence, broadcast) collapse into one transport: Server-Sent Events via browser-native `EventSource` + an append-only `workspace_events` table + Postgres `LISTEN/NOTIFY` wake + adaptive polling fallback + cursor resume via `Last-Event-ID`. Event log rows on state transitions only, never on heartbeats (heartbeats update `agent_status.last_heartbeat_at` in place; transitions insert an event + NOTIFY). Extract as `@chester-hill-solutions/pg-realtime` shared package. The pattern is proven in quick-canvass. Predictive-dial "broadcasts" are event-shaped (Twilio-callback-driven, unidirectional, resume-valuable) so they fit SSE too — no need for a second WebSocket transport. `DATABASE_DIRECT_URL` is used for LISTEN/NOTIFY because pooled URLs (PgBouncer transaction mode) don't support LISTEN. The SSE route must be outside the `_auth` layout (streaming Response breaks body writes inside layout middleware). `workspace_events` is ephemeral (pruned by worker maintenance); `workspace_activity_log` is permanent audit.

## Considered Options

- **WebSocket + Postgres LISTEN/NOTIFY** — bidirectional, but all traffic is unidirectional server→client.
- **Hosted realtime (Ably/Pusher)** — adds vendor + recurring cost.
- **SSE + WS hybrid** — analysis showed broadcasts are low-frequency, unidirectional, resume-valuable, so SSE is strictly better.

## References

- `app/hooks/call/useSupabaseRoom.ts:168,157` (presence + broadcast — being replaced)
- quick-canvass `app/features/workspace-events/workspace-event-stream.tsx` (proven SSE client), `app/server/workspace-events-stream.server.ts` (LISTEN/NOTIFY + adaptive poll), `app/server/workspace-events-listen.server.ts` (`DATABASE_DIRECT_URL`, per-workspace channel naming)
- `app/components/audience/AudienceUploader.tsx` (existing SSE+polling-fallback precedent — 5-failure threshold → HTTP poll)
