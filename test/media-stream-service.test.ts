import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { describe, expect, test, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import { createMediaStreamToken } from "@/lib/media-stream-token.server";

function getHealth(port: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}/healthz`, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on("error", reject);
  });
}

async function waitForPort(port: number, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await getHealth(port);
      if (res.status === 200) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Service did not start on port ${port} within ${timeout}ms`);
}

describe("media-stream-service", () => {
  let service: ChildProcess;
  let port: number;

  beforeEach(async () => {
    process.env.MEDIA_STREAM_SECRET = "test-media-stream-secret";
    // MEDIA_STREAM_PORT=0 lets the OS assign a free port (Bun.serve supports
    // it); the service logs the actual binding at startup. A port picked from
    // a fixed random range intermittently collided with busy CI ports.
    service = spawn("bun", ["run", "services/media-stream/index.ts"], {
      env: {
        ...process.env,
        MEDIA_STREAM_PORT: "0",
        MEDIA_STREAM_SECRET: "test-media-stream-secret",
        NODE_ENV: "test",
      },
      stdio: "pipe",
    });

    const boundPort = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error("Timed out waiting for media-stream listening log"),
          ),
        10_000,
      );
      let buffered = "";
      service.stdout?.on("data", (data) => {
        // eslint-disable-next-line no-console
        console.log(`[media-stream stdout] ${data}`);
        buffered += String(data);
        for (const line of buffered.split("\n")) {
          if (!line.includes("Media-stream service listening")) continue;
          const match = /"port":\s*(\d+)/.exec(line);
          if (match) {
            clearTimeout(timer);
            resolve(Number(match[1]));
            return;
          }
        }
      });
      service.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`media-stream exited before listening (code ${code})`));
      });
    });
    service.stderr?.on("data", (data) => {
      // eslint-disable-next-line no-console
      console.error(`[media-stream stderr] ${data}`);
    });

    port = await boundPort;
    await waitForPort(port);
  });

  afterEach(async () => {
    if (service && !service.killed) {
      service.kill("SIGTERM");
      await new Promise((resolve) => service.once("exit", resolve));
    }
  });

  function token(sessionId: string, exp?: number) {
    return createMediaStreamToken({
      workspaceId: "ws-1",
      campaignId: "camp-1",
      userId: "user-1",
      sessionId,
      exp: exp ?? Math.floor(Date.now() / 1000) + 60,
    });
  }

  test("/healthz returns ok", async () => {
    const res = await getHealth(port);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { status: string; maxPerWorkspace: number };
    expect(body.status).toBe("ok");
    expect(body.maxPerWorkspace).toBe(10);
  });

  test("rejects WebSocket upgrade without token", async () => {
    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/session-1`);
        ws.on("open", () => reject(new Error("Should not connect")));
        ws.on("error", (err) => {
          if (err.message.includes("401") || err.message.includes("Unauthorized")) {
            resolve();
          } else {
            reject(err);
          }
        });
        ws.on("close", (code) => {
          if (code === 1006) resolve();
        });
      })
    ).resolves.toBeUndefined();
  });

  test("rejects WebSocket upgrade with invalid token", async () => {
    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/session-1?token=invalid-token`);
        ws.on("open", () => reject(new Error("Should not connect")));
        ws.on("error", () => resolve());
        ws.on("close", (code) => {
          if (code === 1006) resolve();
        });
      })
    ).resolves.toBeUndefined();
  });

  test("rejects WebSocket upgrade with token for a different session", async () => {
    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${port}/session-2?token=${token("session-1")}`
        );
        ws.on("open", () => reject(new Error("Should not connect")));
        ws.on("error", () => resolve());
        ws.on("close", (code) => {
          if (code === 1006) resolve();
        });
      })
    ).resolves.toBeUndefined();
  });

  test("accepts WebSocket upgrade with valid token", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/session-1?token=${token("session-1")}`);
    await expect(
      new Promise<void>((resolve, reject) => {
        ws.on("open", () => resolve());
        ws.on("error", reject);
      })
    ).resolves.toBeUndefined();
    ws.close();
  });

  test("forwards messages between clients in the same session", async () => {
    const sessionId = "session-passthrough";
    const tok = token(sessionId);
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/${sessionId}?token=${tok}`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/${sessionId}?token=${tok}`);

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        ws1.on("open", resolve);
        ws1.on("error", reject);
      }),
      new Promise<void>((resolve, reject) => {
        ws2.on("open", resolve);
        ws2.on("error", reject);
      }),
    ]);

    const received = await new Promise<Buffer>((resolve, reject) => {
      ws2.on("message", (data) => resolve(data as Buffer));
      ws2.on("error", reject);
      setTimeout(() => reject(new Error("Timeout waiting for message")), 2000);
      ws1.send(Buffer.from("hello"));
    });

    expect(received.toString()).toBe("hello");
    ws1.close();
    ws2.close();
  });

  test("does not forward messages back to the sender", async () => {
    const sessionId = "session-no-echo";
    const tok = token(sessionId);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${sessionId}?token=${tok}`);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    let echoed = false;
    ws.on("message", () => {
      echoed = true;
    });

    ws.send(Buffer.from("ping"));
    await new Promise((r) => setTimeout(r, 200));
    expect(echoed).toBe(false);
    ws.close();
  });

  test("rejects WebSocket upgrade when workspace stream cap is exceeded", async () => {
    if (service && !service.killed) {
      service.kill("SIGTERM");
      await new Promise((resolve) => service.once("exit", resolve));
    }

    const capPort = port + 1;
    service = spawn("bun", ["run", "services/media-stream/index.ts"], {
      env: {
        ...process.env,
        MEDIA_STREAM_PORT: String(capPort),
        MEDIA_STREAM_MAX_PER_WORKSPACE: "1",
        MEDIA_STREAM_SECRET: "test-media-stream-secret",
        NODE_ENV: "test",
      },
      stdio: "pipe",
    });
    await waitForPort(capPort);

    const ws1 = new WebSocket(
      `ws://127.0.0.1:${capPort}/session-cap-1?token=${token("session-cap-1")}`,
    );
    await new Promise<void>((resolve, reject) => {
      ws1.on("open", resolve);
      ws1.on("error", reject);
    });

    await expect(
      new Promise<void>((resolve, reject) => {
        const ws2 = new WebSocket(
          `ws://127.0.0.1:${capPort}/session-cap-2?token=${token("session-cap-2")}`,
        );
        ws2.on("open", () => reject(new Error("Should not connect")));
        ws2.on("error", () => resolve());
        ws2.on("close", (code) => {
          if (code === 1006) resolve();
        });
      }),
    ).resolves.toBeUndefined();

    ws1.close();
  });

  test("rejects expired token", async () => {
    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${port}/session-1?token=${token("session-1", Math.floor(Date.now() / 1000) - 1)}`
        );
        ws.on("open", () => reject(new Error("Should not connect")));
        ws.on("error", () => resolve());
        ws.on("close", (code) => {
          if (code === 1006) resolve();
        });
      })
    ).resolves.toBeUndefined();
  });
});
