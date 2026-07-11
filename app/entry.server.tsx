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
  // Abort any Suspense boundaries still pending after the delay so responses
  // always complete (parity with the old renderToPipeableStream abort timer).
  const abortTimer = setTimeout(() => controller.abort(), ABORT_DELAY);

  try {
    const body = await renderToReadableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        signal: controller.signal,
        onError(error: unknown) {
          // An intentional abort (slow Suspense past ABORT_DELAY) is not a
          // render failure — the shell already streamed, so keep the 2xx and
          // let the flushed content stand. Only real errors become a 500.
          if (controller.signal.aborted) return;
          responseStatusCode = 500;
          // Shell errors reject the render promise and are logged by
          // handleDocumentRequest; only log post-shell streaming errors here.
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
  } finally {
    clearTimeout(abortTimer);
  }
}
