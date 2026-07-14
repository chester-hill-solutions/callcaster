import { randomUUID } from "node:crypto";
import type { ServerWebSocket } from "bun";
import { verifyMediaStreamToken, type MediaStreamTokenPayload } from "@/lib/media-stream-token.server";
import {
  captureException,
  initializeSentry,
} from "@/lib/sentry.server";
import {
  parseMediaStreamMaxPerWorkspace,
  WorkspaceStreamCapTracker,
} from "./workspace-stream-cap";

const PORT = parseInt(process.env.MEDIA_STREAM_PORT ?? "3001", 10);
initializeSentry("callcaster-media-stream");
const maxPerWorkspace = parseMediaStreamMaxPerWorkspace();
const workspaceCaps = new WorkspaceStreamCapTracker(maxPerWorkspace);

// Map of sessionId -> connected clients in that session.
type MediaStreamSocketData = MediaStreamTokenPayload & { requestId: string };
const sessions = new Map<string, Set<ServerWebSocket<MediaStreamSocketData>>>();

function log(level: "info" | "error", message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, message, ...meta }));
}

const server = Bun.serve<MediaStreamSocketData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    const requestId = req.headers.get("x-request-id") || randomUUID();

    if (url.pathname === "/healthz") {
      return new Response(
        JSON.stringify({
          status: "ok",
          maxPerWorkspace,
          activeConnections: workspaceCaps.totalActive(),
          activeWorkspaces: workspaceCaps.activeWorkspaceCount(),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": requestId,
          },
        },
      );
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) {
      return new Response("Not found", {
        status: 404,
        headers: { "x-request-id": requestId },
      });
    }

    const sessionId = segments[0];
    const token = url.searchParams.get("token");
    if (!token) {
      log("error", "Missing media-stream token", { sessionId, requestId, remoteAddress: server.requestIP?.(req) ?? null });
      return new Response("Missing media-stream token", {
        status: 401,
        headers: { "x-request-id": requestId },
      });
    }

    let payload: MediaStreamTokenPayload;
    try {
      payload = verifyMediaStreamToken(token);
    } catch (error) {
      log("error", "Invalid media-stream token", {
        sessionId,
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      captureException(error, { sessionId, requestId });
      return new Response("Invalid media-stream token", {
        status: 401,
        headers: { "x-request-id": requestId },
      });
    }

    if (payload.sessionId !== sessionId) {
      log("error", "Session ID mismatch", { sessionId, requestId, tokenSessionId: payload.sessionId });
      return new Response("Session ID mismatch", {
        status: 403,
        headers: { "x-request-id": requestId },
      });
    }

    if (!workspaceCaps.tryAcquire(payload.workspaceId)) {
      log("error", "Workspace stream cap exceeded", {
        sessionId,
        requestId,
        workspaceId: payload.workspaceId,
        maxPerWorkspace,
        activeConnections: workspaceCaps.getCount(payload.workspaceId),
      });
      return new Response(
        JSON.stringify({
          error: "Workspace stream cap exceeded",
          workspaceId: payload.workspaceId,
          maxPerWorkspace,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": requestId,
          },
        },
      );
    }

    const success = server.upgrade(req, {
      data: { ...payload, requestId },
      headers: { "x-request-id": requestId },
    });
    if (!success) {
      workspaceCaps.release(payload.workspaceId);
      log("error", "WebSocket upgrade failed", { sessionId, requestId });
      return new Response("WebSocket upgrade failed", {
        status: 400,
        headers: { "x-request-id": requestId },
      });
    }

    // Returning undefined after a successful upgrade is required by Bun.serve.
    return undefined;
  },
  websocket: {
    open(ws) {
      const { sessionId, userId, requestId } = ws.data;
      log("info", "Client connected", { sessionId, userId, requestId, remoteAddress: ws.remoteAddress });
      let clients = sessions.get(sessionId);
      if (!clients) {
        clients = new Set();
        sessions.set(sessionId, clients);
      }
      clients.add(ws);
    },
    message(ws, message) {
      const { sessionId } = ws.data;
      const clients = sessions.get(sessionId);
      if (!clients) return;

      // Passthrough/echo: forward every packet to the other clients in the session.
      // TODO: Deepgram Nova-3 streaming integration for live transcription.
      for (const client of clients) {
        if (client !== ws) {
          client.send(message);
        }
      }
    },
    close(ws, code, reason) {
      const { sessionId, userId, workspaceId, requestId } = ws.data;
      workspaceCaps.release(workspaceId);
      log("info", "Client disconnected", {
        sessionId,
        userId,
        workspaceId,
        requestId,
        code,
        reason: reason ? Buffer.from(reason).toString("utf-8") : undefined,
      });
      const clients = sessions.get(sessionId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          sessions.delete(sessionId);
        }
      }
    },
  },
});

log("info", "Media-stream service listening", {
  port: server.port,
  maxPerWorkspace,
});
