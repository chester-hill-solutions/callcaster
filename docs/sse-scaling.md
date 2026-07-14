# SSE scaling — `/api/workspaces/:workspaceId/events`

Operational guidance for the workspace events SSE route ([`events.loader.server.ts`](../app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts)) when running multiple web replicas (WS-E).

## Transport stack

1. **Primary wake:** Postgres `LISTEN` on `WORKSPACE_EVENTS_NOTIFY_CHANNEL` via `DATABASE_DIRECT_URL` (`directPool` in [`app/server/db.ts`](../app/server/db.ts)).
2. **Fallback poll:** `setInterval` every **2 seconds** (`POLL_INTERVAL_MS = 2_000`) re-queries `workspace_events` when NOTIFY is unavailable or missed.
3. **Heartbeat:** comment frames every **15 seconds** (`HEARTBEAT_INTERVAL_MS = 15_000`) to keep intermediaries from timing out idle connections.
4. **Resume:** clients send `Last-Event-ID`; the loader replays from `id > cursor`.

## LISTEN connection budget per replica

Each open SSE connection attempts one dedicated `LISTEN` subscription on the **direct** Postgres pool (`directPool`, `max: 5` in [`app/server/db.ts`](../app/server/db.ts)).

| Resource | Default cap | Notes |
|---|---|---|
| `directPool.max` | **5** | Shared by all LISTEN subscribers in the process |
| Practical SSE + LISTEN ceiling / replica | **~5** concurrent streams with NOTIFY wake | Beyond this, new streams still work but fall back to polling only |
| Query pool (`pool.max`) | **10** | Used for `fetchWorkspaceEventsAfter`; separate from LISTEN |

**Sizing rule of thumb:** plan **one direct connection per active SSE stream**, capped by `directPool.max`. If you need more than five concurrent event streams per replica, raise `DATABASE_DIRECT_URL` pool `max` deliberately and confirm Postgres `max_connections` headroom.

When LISTEN setup fails (pooled URL, connection limit, or transient error), the route logs nothing fatal and relies on the 2s poll — functionally correct, higher latency.

## Sticky sessions (recommended)

SSE is a long-lived HTTP connection. Without sticky routing:

- Reconnects after deploys or load-balancer rotation may land on a different replica (usually fine — cursor resume handles it).
- Operational debugging (per-replica LISTEN counts, connection churn) is harder.

**Recommendation:** enable **session affinity / sticky cookies** on the load balancer for `GET /api/workspaces/*/events` in multi-replica deployments. This keeps a user's event stream on one replica for the lifetime of the connection and aligns LISTEN fan-out with connection counts.

Auth is stateless (session cookie + data-plane middleware); stickiness is an infrastructure concern, not an app requirement.

## Fallback poll interval

| Constant | Value | Purpose |
|---|---|---|
| `POLL_INTERVAL_MS` | **2000 ms** | Safety net when NOTIFY is down or filtered |
| `HEARTBEAT_INTERVAL_MS` | **15000 ms** | Proxy keep-alive |

Worst-case event delivery latency without NOTIFY is roughly one poll interval (~2s) plus query time. Do not lower the poll interval aggressively without measuring DB load — each connected client issues a read every 2s even when idle.

## Operational limits

| Limit | Guidance |
|---|---|
| Concurrent SSE clients / workspace | No hard app cap; bounded by replica LISTEN budget and DB connections |
| Events per flush | Batches of up to **100** rows per query; loops until caught up |
| Auth | Data-plane middleware + session; 404 for non-members |
| Idle connection duration | Limited by platform/proxy timeouts; 15s heartbeats help |
| Cross-workspace NOTIFY | Payload includes `workspace_id`; unrelated workspaces are ignored |

### Monitoring checklist

- `directPool` connection utilization (LISTEN leaks show up as monotonic growth — see comment in events loader about `unlisten`).
- Postgres `max_connections` vs `(replicas × directPool.max)`.
- Rate of `workspace_events` inserts (NOTIFY fan-out is O(active listeners) per notify).
- 429 / 5xx on auth-adjacent routes (Postgres-backed rate limits in [`platform-rate-limit.server.ts`](../app/lib/platform-rate-limit.server.ts)).

### Related

- ADR-0005: [pg-realtime SSE + LISTEN/NOTIFY](adr/0005-pg-realtime-sse-workspace-events-listen-notify.md)
- Rate limiting: [`rate_limit_bucket`](../client/migrations/20260714120000_rate_limit_bucket.sql) + `check_rate_limit_bucket()` RPC
