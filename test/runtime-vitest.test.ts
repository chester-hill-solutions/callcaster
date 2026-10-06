import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { request } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ViteDevServer } from "vite";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const scriptkitRequire = createRequire(
  require.resolve("@chester-hill-solutions/scriptkit-call-script-react"),
);
const consumers = [
  { name: "root Vitest", require: createRequire(require.resolve("vitest")) },
  {
    name: "ScriptKit Vitest",
    require: createRequire(scriptkitRequire.resolve("vitest")),
  },
];

function readHttp(
  port: number,
  path: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path, agent: false },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
          }),
        );
        response.once("error", reject);
      },
    );
    req.setTimeout(5_000, () =>
      req.destroy(new Error("HTTP fixture timed out")),
    );
    req.once("error", reject);
    req.end();
  });
}

function message(socket: WebSocket, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      socket.off("message", receive);
      reject(new Error(`WebSocket fixture timed out: ${event}`));
    }, 5_000);
    function receive(data: WebSocket.RawData) {
      const value = JSON.parse(data.toString());
      if (value.type === event || value.event === event) {
        clearTimeout(deadline);
        socket.off("message", receive);
        resolve();
      }
    }
    socket.on("message", receive);
  });
}

async function closeSocket(socket: WebSocket) {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => {
    socket.once("close", resolve);
    socket.terminate();
  });
}

for (const consumer of consumers) {
  describe(`${consumer.name} installed mocker boundary`, () => {
    let directory: string;
    let root: string;
    let port: number;
    let server: ViteDevServer | undefined;
    let socket: WebSocket | undefined;
    const insideMarker = "OWNED_VITEST_VALID_REDIRECT";
    const outsideMarker = "OWNED_VITEST_OUTSIDE_REDIRECT";
    const deniedMarker = "OWNED_VITEST_DENIED_REDIRECT";

    beforeAll(async () => {
      directory = realpathSync(
        mkdtempSync(join(tmpdir(), "callcaster-vitest-")),
      );
      root = join(directory, "root");
      mkdirSync(root);
      for (const target of [
        "valid-target",
        "outside-target",
        "denied-target",
        "unmocked-target",
      ]) {
        writeFileSync(
          join(root, `${target}.js`),
          `export const value = ${JSON.stringify(target)};`,
        );
      }
      writeFileSync(
        join(root, "valid.js"),
        `export const value = ${JSON.stringify(insideMarker)};`,
      );
      writeFileSync(
        join(directory, "outside.js"),
        `export const value = ${JSON.stringify(outsideMarker)};`,
      );
      writeFileSync(
        join(root, ".env"),
        `export const value = ${JSON.stringify(deniedMarker)};`,
      );
      const { createServer } = await import(
        pathToFileURL(consumer.require.resolve("vite")).href
      );
      const { interceptorPlugin } = await import(
        pathToFileURL(consumer.require.resolve("@vitest/mocker/node")).href
      );
      server = await createServer({
        root,
        configFile: false,
        envFile: false,
        logLevel: "silent",
        plugins: [interceptorPlugin()],
        server: {
          host: "127.0.0.1",
          port: 0,
          fs: { strict: true, allow: [root] },
        },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === "string")
        throw new Error("Fixture did not bind a TCP port");
      port = address.port;
      socket = new WebSocket(`ws://127.0.0.1:${port}`, "vite-hmr");
      await message(socket, "connected");
    });

    afterAll(async () => {
      if (socket) await closeSocket(socket);
      await server?.close();
      if (directory) rmSync(directory, { recursive: true, force: true });
    });

    async function redirect(target: string, destination: string) {
      if (!socket) throw new Error("Fixture socket is not connected");
      const result = message(socket, "vitest:interceptor:register:result");
      socket.send(
        JSON.stringify({
          type: "custom",
          event: "vitest:interceptor:register",
          data: {
            type: "redirect",
            raw: `./${target}.js`,
            id: join(root, `${target}.js`),
            url: `/${target}.js`,
            redirect: destination,
          },
        }),
      );
      await result;
      return readHttp(port, `/${target}.js`);
    }

    test("serves an unmocked module", async () => {
      const response = await readHttp(port, "/unmocked-target.js");
      expect(response.status).toBe(200);
      expect(response.body).toContain("unmocked-target");
    });

    test("serves a valid redirect registered over the standalone socket", async () => {
      const response = await redirect("valid-target", "file:///valid.js");
      expect(response.status).toBe(200);
      expect(response.body).toContain(insideMarker);
    });

    test("denies an outside redirect over the connected socket without Origin", async () => {
      const control = await readHttp(
        port,
        `/@fs${join(directory, "outside.js")}`,
      );
      expect(control.status).toBe(403);
      expect(control.body).not.toContain(outsideMarker);
      const response = await redirect("outside-target", "owned:../outside.js");
      expect(response.status).toBe(200);
      expect(response.body).toContain("outside-target");
      expect(response.body).not.toContain(outsideMarker);
    });

    test("denies an in-root protected redirect over the standalone socket", async () => {
      const control = await readHttp(port, "/.env");
      expect(control.status).toBe(403);
      expect(control.body).not.toContain(deniedMarker);
      const response = await redirect("denied-target", "file:///.env");
      expect(response.status).toBe(200);
      expect(response.body).toContain("denied-target");
      expect(response.body).not.toContain(deniedMarker);
    });

    test("does not register raw socket mocks when registration belongs to an authenticated channel", async () => {
      const { createServer } = await import(
        pathToFileURL(consumer.require.resolve("vite")).href
      );
      const { interceptorPlugin } = await import(
        pathToFileURL(consumer.require.resolve("@vitest/mocker/node")).href
      );
      const isolated = await createServer({
        root,
        configFile: false,
        envFile: false,
        logLevel: "silent",
        plugins: [interceptorPlugin({ registerWebSocketEvents: false })],
        server: {
          host: "127.0.0.1",
          port: 0,
          fs: { strict: true, allow: [root] },
        },
      });
      let raw: WebSocket | undefined;
      try {
        await isolated.listen();
        const address = isolated.httpServer?.address();
        if (!address || typeof address === "string")
          throw new Error("Fixture did not bind a TCP port");
        const connection = new WebSocket(
          `ws://127.0.0.1:${address.port}`,
          "vite-hmr",
        );
        raw = connection;
        await message(connection, "connected");
        connection.send(
          JSON.stringify({
            type: "custom",
            event: "vitest:interceptor:register",
            data: {
              type: "redirect",
              raw: "./valid-target.js",
              id: join(root, "valid-target.js"),
              url: "/valid-target.js",
              redirect: "file:///valid.js",
            },
          }),
        );
        // A pong follows the registration frame. No timing delay or cached module can hide a write.
        await new Promise<void>((resolve, reject) => {
          const deadline = setTimeout(
            () => reject(new Error("WebSocket pong timed out")),
            5_000,
          );
          connection.once("pong", () => {
            clearTimeout(deadline);
            resolve();
          });
          connection.ping();
        });
        const response = await readHttp(address.port, "/valid-target.js");
        expect(response.status).toBe(200);
        expect(response.body).toContain("valid-target");
        expect(response.body).not.toContain(insideMarker);
      } finally {
        if (raw) await closeSocket(raw);
        await isolated.close();
      }
    });
  });

  describe(`${consumer.name} installed API trust contract`, () => {
    test.each(["0.0.0.0", "192.0.2.1"])(
      "disables write and exec on exposed host %s",
      async (host) => {
        const { resolveApiServerConfig } = await import(
          pathToFileURL(consumer.require.resolve("vitest/node")).href
        );
        const api = resolveApiServerConfig({ api: { host } }, 51204);
        expect(api.allowWrite).toBe(false);
        expect(api.allowExec).toBe(false);
      },
    );
    test("retains explicit privileged opt-in", async () => {
      const { resolveApiServerConfig } = await import(
        pathToFileURL(consumer.require.resolve("vitest/node")).href
      );
      const api = resolveApiServerConfig(
        { api: { host: "0.0.0.0", allowWrite: true, allowExec: true } },
        51204,
      );
      expect(api.allowWrite).toBe(true);
      expect(api.allowExec).toBe(true);
    });
    test.each([
      undefined,
      "wrong-token",
      "wrong-test-token",
      "owned-test-token",
    ])("validates the API token %s", async (token) => {
      const { isValidApiRequest } = await import(
        pathToFileURL(consumer.require.resolve("vitest/node")).href
      );
      const url =
        token === undefined
          ? "/__vitest_api__"
          : `/__vitest_api__?token=${token}`;
      expect(
        isValidApiRequest({ api: { token: "owned-test-token" } }, { url }),
      ).toBe(token === "owned-test-token");
    });
  });
}
