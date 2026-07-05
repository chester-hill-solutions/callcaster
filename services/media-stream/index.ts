import { env } from "@/lib/env.server";
import { verifyMediaStreamToken, type MediaStreamTokenPayload } from "@/lib/media-stream-token.server";

const PORT = parseInt(process.env.MEDIA_STREAM_PORT ?? "3001", 10);

// Map of sessionId -> connected clients in that session.
const sessions = new Map<string, Set<ServerWebSocket>>();

type ServerWebSocket = import("bun").ServerWebSocket<MediaStreamTokenPayload>;

function log(level: "info" | "error", message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, message, ...meta }));
}

const server = Bun.serve<MediaStreamTokenPayload>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) {
      return new Response("Not found", { status: 404 });
    }

    const sessionId = segments[0];
    const token = url.searchParams.get("token");
    if (!token) {
      log("error", "Missing media-stream token", { sessionId, remoteAddress: server.requestIP?.(req) ?? null });
      return new Response("Missing media-stream token", { status: 401 });
    }

    let payload: MediaStreamTokenPayload;
    try {
      payload = verifyMediaStreamToken(token);
    } catch (error) {
      log("error", "Invalid media-stream token", {
        sessionId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return new Response("Invalid media-stream token", { status: 401 });
    }

    if (payload.sessionId !== sessionId) {
      log("error", "Session ID mismatch", { sessionId, tokenSessionId: payload.sessionId });
      return new Response("Session ID mismatch", { status: 403 });
    }

    const success = server.upgrade(req, { data: payload });
    if (!success) {
      log("error", "WebSocket upgrade failed", { sessionId });
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Returning undefined after a successful upgrade is required by Bun.serve.
    return undefined;
  },
  websocket: {
    open(ws) {
      const { sessionId, userId } = ws.data;
      log("info", "Client connected", { sessionId, userId, remoteAddress: ws.remoteAddress });
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
      const { sessionId, userId } = ws.data;
      log("info", "Client disconnected", {
        sessionId,
        userId,
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

log("info", "Media-stream service listening", { port: server.port });
