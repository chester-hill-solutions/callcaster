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
  { name: "direct Vite", require },
  { name: "Vitest", require: createRequire(require.resolve("vitest")) },
  {
    name: "ScriptKit Vitest",
    require: createRequire(scriptkitRequire.resolve("vitest")),
  },
];

function readHttp(
  port: number,
  path: string,
): Promise<{ status: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path, agent: false },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            contentType: String(response.headers["content-type"] ?? ""),
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

async function invokeOutside(port: number, outside: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, "vite-hmr");
  try {
    return await new Promise<{
      connected: boolean;
      data: { error?: { name: string; message: string } };
    }>((resolve, reject) => {
      let connected = false;
      const timeout = setTimeout(
        () => reject(new Error("WebSocket fixture timed out")),
        5_000,
      );
      const fail = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };
      socket.once("error", fail);
      socket.once("close", () =>
        fail(new Error("WebSocket closed before its invoke response")),
      );
      socket.on("message", (bytes) => {
        const message = JSON.parse(bytes.toString());
        if (message.type === "connected") {
          connected = true;
          socket.send(
            JSON.stringify({
              type: "custom",
              event: "vite:invoke",
              data: {
                name: "fetchModule",
                id: "send:outside",
                data: [pathToFileURL(outside).href + "?raw"],
              },
            }),
          );
        }
        if (
          message.event === "vite:invoke" &&
          message.data?.id === "response:outside"
        ) {
          clearTimeout(timeout);
          resolve({ connected, data: message.data.data });
        }
      });
    });
  } finally {
    await new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) return resolve();
      socket.once("close", resolve);
      socket.terminate();
    });
  }
}

for (const consumer of consumers) {
  describe(`${consumer.name} development file boundary`, () => {
    let directory: string;
    let root: string;
    let outside: string;
    let port: number;
    let server: ViteDevServer | undefined;
    const outsideMarker = "OWNED_VITE_OUTSIDE_MARKER";
    const insideMarker = "OWNED_VITE_INSIDE_MARKER";
    const deniedMarker = "OWNED_VITE_DENIED_MARKER";
    const mapMarker = "OWNED_VITE_MAP_MARKER";

    beforeAll(async () => {
      directory = realpathSync(mkdtempSync(join(tmpdir(), "callcaster-vite-")));
      root = join(directory, "root");
      mkdirSync(root);
      outside = join(directory, "outside.txt");
      writeFileSync(outside, outsideMarker);
      writeFileSync(join(root, ".env"), deniedMarker);
      writeFileSync(
        join(root, "inside.js"),
        `export default ${JSON.stringify(insideMarker)};`,
      );
      writeFileSync(
        join(root, "index.html"),
        '<script type="module" src="/inside.js"></script>',
      );
      const map = JSON.stringify({
        version: 3,
        sources: ["original.js"],
        sourcesContent: [mapMarker],
        names: [],
        mappings: "AAAA",
      });
      writeFileSync(join(directory, "outside.map"), map);
      writeFileSync(join(root, "inside.js.map"), map);
      const { createServer } = await import(
        pathToFileURL(consumer.require.resolve("vite")).href
      );
      server = await createServer({
        configFile: false,
        envFile: false,
        cacheDir: join(root, "node_modules/.vite"),
        root,
        logLevel: "silent",
        server: {
          host: "127.0.0.1",
          port: 0,
          fs: { strict: true, allow: [root] },
        },
        optimizeDeps: { include: [] },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === "string")
        throw new Error("Fixture did not bind a TCP port");
      port = address.port;
    });

    afterAll(async () => {
      await server?.close();
      if (directory) rmSync(directory, { recursive: true, force: true });
    });

    test("serves a valid in-root module", async () => {
      const response = await readHttp(port, "/inside.js");
      expect(response.status).toBe(200);
      expect(response.body).toContain(insideMarker);
    });

    test("loads a valid SSR module", async () => {
      expect((await server!.ssrLoadModule("/inside.js")).default).toBe(
        insideMarker,
      );
    });

    test.each(["?raw", "?import&raw", "?import&url&inline", ""])(
      "denies a protected file with query %s",
      async (query) => {
        const response = await readHttp(port, "/.env" + query);
        expect(response.status).toBe(403);
        expect(response.body).not.toContain(deniedMarker);
      },
    );

    test("denies an outside file over HTTP", async () => {
      const response = await readHttp(port, "/@fs" + outside + "?raw");
      expect(response.status).toBe(403);
      expect(response.body).not.toContain(outsideMarker);
    });

    test("denies file URL raw access over a connected WebSocket without Origin", async () => {
      const response = await invokeOutside(port, outside);
      expect(response.connected).toBe(true);
      expect(response.data.error?.name).toBe("Error");
      expect(response.data.error?.message).toMatch(
        /fetchModule is disabled|not allowed|outside.*allow/i,
      );
      expect(JSON.stringify(response.data)).not.toContain(outsideMarker);
    });

    test("serves a valid in-root source map", async () => {
      const response = await readHttp(port, "/inside.js.map");
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body).sourcesContent).toEqual([mapMarker]);
    });

    test("denies traversal in an optimized dependency source-map request", async () => {
      const response = await readHttp(
        port,
        "/node_modules/.vite/deps/../../../../outside.map",
      );
      expect([200, 403, 404]).toContain(response.status);
      expect(response.body).not.toContain(mapMarker);
      if (response.status === 200) {
        expect(response.contentType).toContain("text/html");
        expect(response.body).toContain("/inside.js");
      }
    });
  });
}
