import { afterEach, describe, expect, test } from "bun:test";
import { createServer, validateEnvironment } from "../server/bun.ts";
import { getRequestId } from "../app/lib/request-context.server.ts";

const servers = new Set<ReturnType<typeof Bun.serve>>();

afterEach(async () => {
  for (const server of servers) {
    server.stop(true);
    servers.delete(server);
  }
});

async function startTestServer(
  acceptingTraffic = true,
  requestHandler: (request: Request) => Promise<Response> = async () =>
    new Response(null, { status: 204 }),
) {
  const readyState = { acceptingTraffic, buildReady: true };
  const server = await createServer({
    build: {},
    readyState,
    skipDbHealthCheck: true,
    port: 0,
    requestHandler,
  });

  servers.add(server);

  return { server, readyState, port: server.port! };
}

async function requestServer(port: number, pathname: string) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "GET",
  });
  const body = await response.text();

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  };
}

describe("server runtime", () => {
  test("serves health and readiness probes with request ids", async () => {
    const { port } = await startTestServer(true);

    const health = await requestServer(port, "/healthz");
    const ready = await requestServer(port, "/readyz");

    expect(health.statusCode).toBe(200);
    expect(health.body).toBe(JSON.stringify({ ok: true }));
    expect(typeof health.headers["x-request-id"]).toBe("string");

    expect(ready.statusCode).toBe(200);
    expect(ready.body).toBe(JSON.stringify({ ok: true }));
  });

  test("returns 503 for readiness during drain", async () => {
    const { port, readyState } = await startTestServer(true);
    readyState.acceptingTraffic = false;

    const ready = await requestServer(port, "/readyz");

    expect(ready.statusCode).toBe(503);
    expect(ready.body).toBe(
      JSON.stringify({
        ok: false,
        buildReady: true,
        acceptingTraffic: false,
        databaseReady: true,
        databaseListenReady: true,
      }),
    );
  });

  test("fails fast when required env vars are missing", () => {
    expect(() => validateEnvironment({ AUTH_URL: "http://localhost" })).toThrow(
      "Missing required environment variables:",
    );
  });

  test("serves public files with URL-encoded names", async () => {
    const { port } = await startTestServer(true);

    const font = await requestServer(port, "/fonts/Tabac%20Slab.otf");

    expect(font.statusCode).toBe(200);
    expect(font.headers["content-type"]).toBe("font/otf");
  });

  test("rejects encoded path traversal outside the public dir", async () => {
    const { port } = await startTestServer(true);

    const escape = await requestServer(port, "/fonts/..%2F..%2Fpackage.json");

    // Must fall through to the app handler (stubbed to 204), never serve the file.
    expect(escape.statusCode).toBe(204);
  });

  test("propagates inbound request ids through async request context", async () => {
    let contextRequestId: string | undefined;
    const { port } = await startTestServer(true, async () => {
      await Promise.resolve();
      contextRequestId = getRequestId();
      return new Response(null, { status: 204 });
    });

    const response = await fetch(`http://127.0.0.1:${port}/context`, {
      headers: { "x-request-id": "req-inbound" },
    });

    expect(contextRequestId).toBe("req-inbound");
    expect(response.headers.get("x-request-id")).toBe("req-inbound");
  });
});
