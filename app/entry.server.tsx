/**
 * React Router streaming SSR entry.
 *
 * Uses renderToReadableStream (web streams): Bun resolves `react-dom/server`
 * to `server.bun.js`, which — as of React 19 — no longer exports the
 * node-streams renderToPipeableStream. The web-streams renderer works under
 * both Bun (production server) and Node (vite dev).
 */

import { ServerRouter } from "react-router";
import type { AppLoadContext, EntryContext } from "react-router";

import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import { logger } from "@/lib/logger.server";

const ABORT_DELAY = 5_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  let shellRendered = false;
  const controller = new AbortController();
  // Matches the previous renderToPipeableStream behavior: abort any Suspense
  // boundaries still pending after the delay so responses always complete.
  setTimeout(() => controller.abort(), ABORT_DELAY);

  const body = await renderToReadableStream(
    <ServerRouter context={reactRouterContext} url={request.url} />,
    {
      signal: controller.signal,
      onError(error: unknown) {
        responseStatusCode = 500;
        // Log streaming rendering errors from inside the shell. Shell errors
        // reject the render promise and are logged by handleDocumentRequest.
        if (shellRendered) {
          logger.error("Streaming render error:", error);
        }
      },
    },
  );
  shellRendered = true;

  // Bots get the fully rendered document (parity with onAllReady).
  if (isbot(request.headers.get("user-agent") || "")) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
