import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { init } from "es-module-lexer";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

describe("call-screen audio during React Router server rendering", () => {
  let cache: string;
  let server: ViteDevServer | undefined;
  let view: typeof import("./helpers/agent-audio-ssr");

  beforeAll(async () => {
    // Use the installed Router transform. Plain Vitest imports do not remove
    // .client exports and would miss a controller constructed during SSR.
    await init;
    const clientBoundary = reactRouter().find(plugin => plugin.name === "react-router:dot-client");
    if (!clientBoundary) throw new Error("React Router client boundary was not found");
    cache = mkdtempSync(join(tmpdir(), "callcaster-audio-ssr-"));
    server = await createServer({
      configFile: false,
      envFile: false,
      mode: "production",
      cacheDir: cache,
      logLevel: "silent",
      plugins: [clientBoundary],
      resolve: { alias: { "@": resolve("app") } },
      server: { middlewareMode: true, hmr: false },
      optimizeDeps: { noDiscovery: true },
    });
    view = await server.ssrLoadModule("/test/helpers/agent-audio-ssr.ts");
  });

  afterAll(async () => {
    await server?.close();
    if (cache) rmSync(cache, { recursive: true, force: true });
  });

  test("renders audio selection before browser storage or media exists", () => {
    expect(view.renderAudioSelection()).toBe("<p>Checking audio</p>");
  });

  test("renders manual dial before browser storage or media exists", () => {
    expect(view.renderManualDial()).toBe("<p>Ready to dial</p>");
  });
});
