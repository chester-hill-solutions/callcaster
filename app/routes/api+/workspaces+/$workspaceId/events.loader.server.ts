import type { LoaderFunctionArgs } from "react-router";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { AppError } from "@/lib/errors.server";
import { verifyAuth } from "@/lib/auth.server";
import {
  WORKSPACE_EVENTS_NOTIFY_CHANNEL,
  fetchWorkspaceEventsAfter,
} from "@/lib/workspace-events.server";
import { directPool } from "@/server/db";

const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

function parseCursor(request: Request): number {
  const header = request.headers.get("Last-Event-ID");
  if (!header) return 0;
  const parsed = Number.parseInt(header, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
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

export async function loader({ request, params }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return new Response("workspaceId is required", { status: 400 });
  }

  const { headers, user } = await verifyAuth(request);

  try {
    await requireWorkspaceAccess({ user, workspaceId });
  } catch (error) {
    if (error instanceof AppError) {
      return new Response(error.message, { status: error.statusCode });
    }
    throw error;
  }

  const initialCursor = parseCursor(request);

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
        if (!closed) {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }
      }, HEARTBEAT_INTERVAL_MS);

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
          listenUnsubscribe = (listenResult as unknown as { unsubscribe: () => Promise<void> }).unsubscribe;
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
