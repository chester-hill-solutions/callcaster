import { getSession } from "@/lib/auth.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineLoader } from "@/lib/handler.server";
import { logger } from "@/lib/logger.server";
import type { DataPlaneAuthContextValue } from "@/lib/route-context.server";
import { ACCESS_REVOKED_EVENT } from "@/lib/workspace-events.shared";
import { getUserRole } from "@/lib/workspace-membership.server";
import {
  WORKSPACE_EVENTS_NOTIFY_CHANNEL,
  fetchWorkspaceEventsAfter,
  getLatestWorkspaceEventId,
} from "@/lib/workspace-events.server";
// directPool is required for Postgres LISTEN/NOTIFY; tdb cannot provide raw pool access.
// eslint-disable-next-line no-restricted-imports
import { directPool } from "@/server/db";

const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

/** Terminal frame telling the client its workspace access is gone. */
const ACCESS_REVOKED_FRAME = `event: ${ACCESS_REVOKED_EVENT}\ndata: {"reason":"workspace_access_revoked"}\n\n`;

/**
 * Resume point, or null for a first connection.
 *
 * EventSource replays `Last-Event-ID` automatically on reconnect, so a resuming
 * client gets exactly what it missed. A first connection has no header, and
 * must NOT start at 0 — see `getLatestWorkspaceEventId`.
 */
function parseCursor(request: Request): number | null {
  const header = request.headers.get("Last-Event-ID");
  if (!header) return null;
  const parsed = Number.parseInt(header, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatSseEvent(event: {
  id: number;
  workspace_id: string;
  event_type: string;
  payload: unknown;
  created_at: string;
}): string {
  const data = JSON.stringify({
    id: event.id,
    workspace_id: event.workspace_id,
    event_type: event.event_type,
    payload: event.payload,
    created_at: event.created_at,
  });
  return `id: ${event.id}\nevent: workspace_event\ndata: ${data}\n\n`;
}

export const loader = defineLoader({
  auth: ({ context, params }) => getDataPlaneRouteContext(context, params.workspaceId),
  sideEffects: ["db-read"],
  handler: (ctx) => streamWorkspaceEvents(ctx.request, ctx.params.workspaceId, ctx.auth),
});

async function streamWorkspaceEvents(
  request: Request,
  workspaceId: string | undefined,
  auth: DataPlaneAuthContextValue,
) {
  if (!workspaceId) {
    return new Response("workspaceId is required", { status: 400 });
  }

  const { headers } = await getSession(request);

  // Membership is verified once, by `dataPlaneMiddleware`, before this loader
  // runs. This stream then outlives that check by design — it is held open
  // indefinitely — so without re-checking, a member removed from the workspace
  // keeps receiving events (including verbatim call transcripts) on an
  // already-open connection. Re-check rides the heartbeat, so revocation takes
  // effect within one HEARTBEAT_INTERVAL_MS rather than instantly.
  const stillHasWorkspaceAccess = async (): Promise<boolean> => {
    // API-key connections are pinned to one workspace when the key is issued
    // and carry no membership to revoke; key revocation is a separate concern.
    if (!auth.userId) return true;
    try {
      return (await getUserRole({ user: { id: auth.userId }, workspaceId })) != null;
    } catch (error) {
      // A failed lookup is not evidence of revocation, and connect-time auth
      // already passed. Dropping every open stream on a database blip would be
      // a self-inflicted outage; the next tick re-checks.
      logger.warn("Workspace SSE access re-check failed; keeping stream open", {
        workspaceId,
        error,
      });
      return true;
    }
  };

  // A reconnect resumes from its last id; a fresh connection starts from the
  // current tip, because its state was just built by loaders and replaying the
  // backlog would re-apply stale row changes over it.
  const resumeFrom = parseCursor(request);
  const initialCursor = resumeFrom ?? (await getLatestWorkspaceEventId(workspaceId));

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let cursor = initialCursor;
      let closed = false;
      let listenUnsubscribe: (() => Promise<void>) | undefined;

      const closeStream = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        void listenUnsubscribe?.();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      const flushEvents = async () => {
        if (closed) return;

        try {
          let events = await fetchWorkspaceEventsAfter(workspaceId, cursor);
          while (events.length > 0 && !closed) {
            for (const event of events) {
              controller.enqueue(encoder.encode(formatSseEvent(event)));
              cursor = event.id;
            }
            if (events.length < 100) break;
            events = await fetchWorkspaceEventsAfter(workspaceId, cursor);
          }
        } catch {
          if (!closed) {
            controller.enqueue(encoder.encode("event: error\ndata: flush_failed\n\n"));
          }
        }
      };

      const pollTimer = setInterval(() => {
        void flushEvents();
      }, POLL_INTERVAL_MS);

      const heartbeatTimer = setInterval(() => {
        void (async () => {
          if (closed) return;
          if (!(await stillHasWorkspaceAccess())) {
            if (closed) return;
            controller.enqueue(encoder.encode(ACCESS_REVOKED_FRAME));
            closeStream();
            return;
          }
          if (closed) return;
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        })();
      }, HEARTBEAT_INTERVAL_MS);

      // Bun's idleTimeout counts from the last byte written, not from
      // connection open. HEARTBEAT_INTERVAL_MS (15s) alone left a ~5s window
      // where nothing was written before Bun's old 10s default idleTimeout
      // fired (server/bun.ts now sets idleTimeout: 120s, but write
      // immediately regardless so the stream is never silent from t=0).
      controller.enqueue(encoder.encode(": connected\n\n"));

      request.signal.addEventListener("abort", closeStream);

      void (async () => {
        await flushEvents();
        if (closed) return;

        try {
          const listenResult = await directPool.listen(
            WORKSPACE_EVENTS_NOTIFY_CHANNEL,
            (payload) => {
              if (closed) return;
              try {
                const parsed = JSON.parse(payload) as { workspace_id?: string };
                if (parsed.workspace_id && parsed.workspace_id !== workspaceId) {
                  return;
                }
              } catch {
                // Ignore malformed NOTIFY payloads; polling will catch up.
              }
              void flushEvents();
            },
          );
          // postgres.js returns { state, unlisten } — using the wrong property
          // here leaks one listener closure per SSE connection for the
          // lifetime of the process.
          listenUnsubscribe = (listenResult as unknown as { unlisten: () => Promise<void> }).unlisten;
        } catch {
          // LISTEN unavailable (e.g. pooled connection); polling fallback only.
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      ...Object.fromEntries(headers.entries()),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
