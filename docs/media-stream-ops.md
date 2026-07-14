# Media-stream service operations

The media-stream Bun service is a **third Railway process** in the CallCaster deployment, separate from the web app and background worker. It handles long-lived WebSocket connections for dashboard audio streaming (and, in future phases, Twilio Media Streams + Deepgram). See [ADR-0030](./adr/0030-media-stream-bun-service-third-railway-process.md) for architecture rationale.

## Independent deploy

| Process | Entry point | Role |
|---|---|---|
| Web | `server/bun.ts` (or Node entry) | HTTP, React Router, Twilio webhooks |
| Worker | `scripts/worker.ts` | Background jobs |
| Media-stream | `services/media-stream/index.ts` | WebSocket bridge |

All three share the same repo and Docker image; only the **start command** differs. Deploy media-stream as its own Railway service so CPU/memory spikes on concurrent audio streams do not affect web request latency or webhook handling.

### Railway setup

1. Create a third service in the CallCaster project (e.g. `callcaster-media-stream`).
2. Use the same image/build as web/worker; set the start command to:
   ```bash
   bun run services/media-stream/index.ts
   ```
3. Set the **health check path** to `/healthz` (HTTP GET, expect `200`).
4. Expose a public hostname for WSS (e.g. `media-stream-production.up.railway.app`).
5. Point the web service at that host via `MEDIA_STREAM_HOST` (no `https://` prefix).

### Failure isolation

- If media-stream is down, dashboard audio streaming fails; the main app, Twilio webhooks, and worker jobs continue.
- If web is down, media-stream health may still pass but new tokens cannot be minted.
- Scale media-stream independently by concurrent WebSocket connections; web autoscaling is not tied to stream count.

## Health check

```
GET /healthz
```

Example response:

```json
{
  "status": "ok",
  "maxPerWorkspace": 10,
  "activeConnections": 3,
  "activeWorkspaces": 2
}
```

Railway (or any load balancer) should treat non-`200` responses as unhealthy.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MEDIA_STREAM_PORT` | No | `3001` | HTTP/WebSocket listen port |
| `MEDIA_STREAM_SECRET` | Yes (prod) | dev fallback | HMAC secret for WS tokens (shared with web) |
| `MEDIA_STREAM_HOST` | Web only | `localhost:3001` | Public host web uses when building WSS URLs |
| `MEDIA_STREAM_MAX_PER_WORKSPACE` | No | `10` | Max concurrent WS connections per workspace |

`MEDIA_STREAM_SECRET` must match between web (token signing) and media-stream (token verification).

## Per-workspace stream caps

Before a WebSocket upgrade, the service counts active connections per `workspaceId` from the signed token. When a workspace reaches `MEDIA_STREAM_MAX_PER_WORKSPACE`, additional upgrade attempts receive **HTTP 503** with a JSON body:

```json
{
  "error": "Workspace stream cap exceeded",
  "workspaceId": "…",
  "maxPerWorkspace": 10
}
```

Slots are released when the connection closes. Caps apply per workspace across all sessions (not per session).

## Local development

```bash
bun run services/media-stream/index.ts
```

Confirm: `curl -s http://localhost:3001/healthz`

Optional cap override:

```bash
MEDIA_STREAM_MAX_PER_WORKSPACE=2 bun run services/media-stream/index.ts
```

See also [local-development.md](./local-development.md).

## Current scope and gaps

The in-repo service today is a **minimal hardened bridge**:

- Token-authenticated WebSocket upgrade
- Session-scoped message passthrough (dashboard `AudioStreamer`)
- Per-workspace concurrent connection limits
- `/healthz` for Railway

**Not yet implemented** (planned per ADR-0027 / ADR-0028):

- Twilio Media Streams protocol (`connected` / `start` / `media` / `stop`)
- Deepgram Nova-3 streaming
- Coaching engine and Postgres writes via admin Drizzle client
- Transcription credit debits

Until those land, Twilio `<Stream>` TwiML should not point at this service in production.
