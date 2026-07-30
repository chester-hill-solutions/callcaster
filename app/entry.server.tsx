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
import { captureException } from "@/lib/sentry.server";
import { recordServerError } from "@/lib/error-rate.server";

/**
 * How long React Router's turbo-stream encoder waits for a deferred loader
 * promise before rejecting it with "Server Timeout".
 *
 * React Router reads this export off the server build (`encodeViaTurboStream`
 * in server-runtime/single-fetch) for BOTH document requests and single-fetch
 * `.data` requests. 4950 is RR's own internal fallback, so stating it here is
 * a no-op for timing — it exists to make the ABORT_DELAY relationship below
 * explicit and reviewable rather than an accident of an undocumented default.
 */
export const streamTimeout = 4_950;

/**
 * When to abort Suspense boundaries still pending, so the HTML stream always
 * closes.
 *
 * MUST stay above `streamTimeout`. turbo-stream rejects a stalled deferred at
 * `streamTimeout` and flushes an error chunk as an inline StreamTransfer
 * script; that rejection is the ONLY thing that can settle the client's
 * deferred promise and let <Await errorElement> render. If React aborts first,
 * the document is truncated before that script is emitted, the client promise
 * never settles, and the boundary suspends forever (React #419 + a permanent
 * "Loading results..."). The gap is the flush window for that error chunk.
 */
export const ABORT_DELAY = streamTimeout + 1_050;

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

    // Clear the abort timer only once the stream is fully DONE — never when the
    // shell resolves. `renderToReadableStream` resolves as soon as the shell is
    // ready, while Suspense boundaries may still be pending; clearing at that
    // point cancels the abort and lets a never-settling boundary hold the
    // response open forever (the deferred promise on the client is fed only by
    // the inline StreamTransfer scripts, so it never settles and <Await>
    // suspends indefinitely rather than reaching its errorElement).
    void body.allReady.then(
      () => clearTimeout(abortTimer),
      () => clearTimeout(abortTimer),
    );

    // Bots get the fully rendered document (parity with onAllReady).
    if (isbot(request.headers.get("user-agent") || "")) {
      await body.allReady;
    }

    responseHeaders.set("Content-Type", "text/html");
    return new Response(body, {
      headers: responseHeaders,
      status: responseStatusCode,
    });
  } catch (error) {
    // The shell itself failed, so nothing will ever settle `allReady`.
    clearTimeout(abortTimer);
    throw error;
  }
}

/**
 * React Router's hook for unhandled loader/action/render errors.
 *
 * This was never exported, so RR used its own default and every such error was
 * structurally invisible — no log line, no counter, nothing to alert on.
 *
 * Note this does NOT fire for errors that `withGuards` (app/lib/handler.server)
 * already catches and converts into a `data(...)` response; those are counted
 * at the other chokepoint, `createErrorResponse`.
 */
export function handleError(
  error: unknown,
  { request }: { request: Request },
): void {
  // A client that navigated away is not an application failure.
  if (request.signal.aborted) {
    return;
  }

  const url = new URL(request.url);
  logger.error("router.unhandled_error", {
    method: request.method,
    path: url.pathname,
    ...(error instanceof Error ? { err: error } : { thrown: String(error) }),
  });
  captureException(error, { method: request.method, path: url.pathname });
  recordServerError();
}
