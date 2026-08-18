import { logger } from "@/lib/logger.client";
import { ACCESS_REVOKED_EVENT } from "@/lib/workspace-events.shared";

/**
 * Shared, reference-counted EventSource per workspace-events URL.
 *
 * Every realtime hook used to open its OWN EventSource to
 * `/api/workspaces/<id>/events`. The call screen alone stacks four such
 * subscriptions (useWorkspaceRealtime's fan-out, useCampaignCallFlow's call
 * watcher, useCallScreen's credit watcher, …) and app-shell hooks (unread
 * counts, upload progress) add more. Over HTTP/1.1 — i.e. every localhost
 * dev/E2E session — the browser allows 6 connections per origin, so the open
 * SSE streams saturate the pool and EVERY later same-origin request silently
 * queues forever. Observed end-to-end: pressing Dial fired the route-discovery
 * `/__manifest` fetch for /api/dial, which never completed, so the dial POST
 * was never sent and the fetcher hung in `submitting` with no error. Document
 * navigations away from the call screen hung the same way. Production behind
 * HTTP/2 masks all of this, which is why it only bites locally.
 *
 * One connection per URL, fanned out to any number of subscribers, keeps the
 * whole app at a single events stream per workspace.
 */

type WorkspaceEventHandler = (message: MessageEvent<string>) => void;

type SharedConnection = {
  eventSource: EventSource;
  subscribers: Set<WorkspaceEventHandler>;
};

const connections = new Map<string, SharedConnection>();

function createConnection(url: string): SharedConnection {
  const eventSource = new EventSource(url);
  const connection: SharedConnection = { eventSource, subscribers: new Set() };

  eventSource.addEventListener("workspace_event", (message) => {
    // Snapshot so a subscriber unsubscribing mid-dispatch doesn't skip others.
    for (const subscriber of [...connection.subscribers]) {
      try {
        subscriber(message as MessageEvent<string>);
      } catch (error) {
        // One bad handler must not starve the rest of the fan-out.
        logger.error("Workspace SSE subscriber failed", error);
      }
    }
  });

  // The server sends this when the user's workspace access is revoked while
  // the stream is open. Close explicitly: EventSource reconnects on its own
  // after a server-side close, and every retry would be rejected by the
  // middleware, so without this the tab retries forever. Drop the cache entry
  // too, so the closed socket is never handed to a future subscriber.
  eventSource.addEventListener(ACCESS_REVOKED_EVENT, () => {
    logger.warn("Workspace access revoked; closing shared SSE connection");
    eventSource.close();
    if (connections.get(url) === connection) {
      connections.delete(url);
    }
  });

  eventSource.onerror = () => {
    logger.debug("Workspace SSE connection interrupted; EventSource will retry");
  };

  return connection;
}

/**
 * Attach a handler to the shared workspace-events stream for `url`, creating
 * the underlying EventSource only for the first subscriber. Returns an
 * unsubscribe function; the connection closes when the last subscriber leaves.
 */
export function subscribeToWorkspaceEventSource(
  url: string,
  onWorkspaceEvent: WorkspaceEventHandler,
): () => void {
  let connection = connections.get(url);
  // A cached connection can be stale two ways: CLOSED (access revoked, or a
  // test tore it down), or built from a different EventSource constructor —
  // vitest re-stubs the global per test, and a socket cached under one test's
  // stub must never be handed to the next test. `instanceof` against the
  // CURRENT global covers both test stubs and is always true in production.
  if (
    !connection ||
    connection.eventSource.readyState === EventSource.CLOSED ||
    !(connection.eventSource instanceof EventSource)
  ) {
    connection = createConnection(url);
    connections.set(url, connection);
  }

  const subscribers = connection.subscribers;
  subscribers.add(onWorkspaceEvent);

  return () => {
    subscribers.delete(onWorkspaceEvent);
    if (subscribers.size === 0) {
      connection.eventSource.close();
      if (connections.get(url) === connection) {
        connections.delete(url);
      }
    }
  };
}

/**
 * Test-only: drop every cached connection. Vitest stubs the global
 * EventSource per test, so a connection cached by one test would otherwise
 * leak its (dead) mock into the next.
 */
export function resetWorkspaceEventSourcesForTests(): void {
  for (const connection of connections.values()) {
    connection.eventSource.close();
  }
  connections.clear();
}
