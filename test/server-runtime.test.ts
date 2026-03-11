import { once } from "node:events";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { createApp, createHttpServer, validateEnvironment } from "../server/index.js";

type TestServer = ReturnType<typeof createHttpServer>;

const servers = new Set<TestServer>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            servers.delete(server);

            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }),
    ),
  );
});

async function startTestServer(acceptingTraffic = true) {
  const readyState = { acceptingTraffic };
  const app = createApp({
    build: {},
    readyState,
    remixHandler: (_request, response) => {
      response.status(204).end();
    },
  });
  const server = createHttpServer(app);

  servers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  return { server, readyState };
}

async function requestServer(server: TestServer, pathname: string) {
  const address = server.address() as AddressInfo;

  return new Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }>(
    (resolve, reject) => {
      const request = httpRequest(
        {
          host: "127.0.0.1",
          port: address.port,
          path: pathname,
          method: "GET",
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            resolve({
              statusCode: response.statusCode ?? 0,
              headers: response.headers,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );

      request.on("error", reject);
      request.end();
    },
  );
}

describe("server runtime", () => {
  test("serves health and readiness probes with request ids", async () => {
    const { server } = await startTestServer(true);

    const health = await requestServer(server, "/healthz");
    const ready = await requestServer(server, "/readyz");

    expect(health.statusCode).toBe(200);
    expect(health.body).toBe(JSON.stringify({ ok: true }));
    expect(health.headers["x-request-id"]).toBeTypeOf("string");

    expect(ready.statusCode).toBe(200);
    expect(ready.body).toBe(JSON.stringify({ ok: true }));
  });

  test("returns 503 for readiness during drain", async () => {
    const { server, readyState } = await startTestServer(true);
    readyState.acceptingTraffic = false;

    const ready = await requestServer(server, "/readyz");

    expect(ready.statusCode).toBe(503);
    expect(ready.body).toBe(JSON.stringify({ ok: false }));
  });

  test("fails fast when required env vars are missing", () => {
    expect(() => validateEnvironment({ SUPABASE_URL: "http://localhost" })).toThrow(
      "Missing required environment variables:",
    );
  });
});
