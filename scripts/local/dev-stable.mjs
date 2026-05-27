#!/usr/bin/env node
/* eslint-env node */

import "dotenv/config";

import { createRequestHandler } from "@react-router/express";
import { createServer as createViteServer } from "vite";
import { createApp, createHttpServer, validateEnvironment } from "../../server/index.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const SERVER_BUILD_MODULE_ID = "virtual:react-router/server-build";

let isShuttingDown = false;
let shutdownPromise = null;

validateEnvironment(process.env);

const vite = await createViteServer({
  appType: "custom",
  server: {
    hmr: {
      port: PORT + 1,
    },
    middlewareMode: true,
  },
});

const readyState = { acceptingTraffic: true, buildReady: true };
const app = createApp({
  configureApp: (expressApp) => {
    expressApp.use(vite.middlewares);
  },
  mode: "development",
  readyState,
  remixHandler: createRequestHandler({
    build: () => vite.ssrLoadModule(SERVER_BUILD_MODULE_ID),
    mode: "development",
  }),
  serveBuildAssets: false,
});

app.use((error, _request, _response, next) => {
  vite.ssrFixStacktrace(error);
  next(error);
});

const server = createHttpServer(app);
const sockets = new Set();

server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});

server.on("error", async (error) => {
  console.error(`[app] ${error instanceof Error ? error.message : String(error)}`);
  await shutdown(1);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(PORT, HOST, resolve);
});

console.log(`[app] development server listening on http://${HOST}:${PORT}`);

process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("SIGTERM", () => {
  void shutdown(0);
});

async function shutdown(exitCode) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  isShuttingDown = true;
  readyState.acceptingTraffic = false;

  shutdownPromise = (async () => {
    await new Promise((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections?.();
    });

    for (const socket of sockets) {
      socket.destroy();
    }

    await vite.close();
    process.exit(exitCode);
  })();

  return shutdownPromise;
}
