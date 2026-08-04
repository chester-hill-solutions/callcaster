import { createElement, Suspense } from "react";
import {
  Await,
  createRequestHandler,
  data as routeData,
  Scripts,
  useLoaderData,
} from "react-router";
import type { ServerBuild } from "react-router";
import { describe, expect, test } from "vitest";

import * as entryServer from "@/entry.server";

/**
 * Repro for JOURNEY-NITPICK-01.
 *
 * Drives a real DOCUMENT request through the app's real server entry with a
 * loader whose deferred promise NEVER settles, and asserts the response body
 * stream actually closes (i.e. the deferred is rejected and an error chunk is
 * streamed) rather than hanging forever behind <Await>.
 */

function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function buildTestServerBuild(loaderPromise: () => Promise<unknown>): ServerBuild {
  const Child = ({ resolved }: { resolved: unknown }) =>
    createElement("span", null, JSON.stringify(resolved));

  // Mirrors $selected_id.route.tsx: a Suspense fallback wrapping an <Await>
  // over the loader's deferred `results`, with an errorElement.
  const RootRoute = () => {
    const { results } = useLoaderData() as { results: Promise<unknown> };
    return createElement(
      "html",
      null,
      createElement(
        "body",
        null,
        createElement(
          Suspense,
          { fallback: createElement("p", null, "Loading results...") },
          createElement(
            Await as never,
            {
              resolve: results,
              errorElement: createElement("p", null, "ErrorLoadingResults"),
            },
            (resolved: unknown) => createElement(Child, { resolved }),
          ),
        ),
        // <Scripts /> emits the inline StreamTransfer chunks that feed the
        // client's deferred promise. root.tsx renders it; without it the
        // client-side deferred can never settle.
        createElement(Scripts, null),
      ),
    );
  };

  return {
    entry: { module: entryServer as unknown as ServerBuild["entry"]["module"] },
    routes: {
      root: {
        id: "root",
        path: "",
        module: {
          default: RootRoute,
          loader: () => routeData({ results: loaderPromise() }),
        },
      },
    },
    assets: {
      entry: { imports: [], module: "/entry.client.js" },
      routes: {
        root: {
          id: "root",
          path: "",
          hasAction: false,
          hasLoader: true,
          hasClientAction: false,
          hasClientLoader: false,
          hasClientMiddleware: false,
          hasErrorBoundary: false,
          imports: [],
          module: "/root.js",
        },
      },
      url: "/manifest.js",
      version: "test",
    } as unknown as ServerBuild["assets"],
    future: {} as ServerBuild["future"],
    ssr: true,
    isSpaMode: false,
    prerender: [],
    publicPath: "/",
    assetsBuildDirectory: "build/client",
    routeDiscovery: { mode: "initial", manifestPath: "/__manifest" },
  } as unknown as ServerBuild;
}

/** Drains a response body, resolving with the full text once the stream CLOSES. */
async function drain(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("entry.server deferred handling", () => {
  test(
    "closes the document stream for a deferred that never settles",
    async () => {
      const handler = createRequestHandler(
        buildTestServerBuild(() => neverSettles<unknown>()),
        "production",
      );

      const response = await handler(
        new Request("http://localhost/", { method: "GET" }),
      );

      expect(response.status).toBe(200);

      // The shell must stream, and the stream must eventually CLOSE. If the
      // deferred never settles and nothing rejects it, this never resolves.
      const body = await Promise.race([
        drain(response),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("TIMEOUT: document stream never closed")),
            15_000,
          ),
        ),
      ]);

      expect(body).toContain("Loading results...");
      // An error chunk for the deferred must reach the client so <Await>'s
      // errorElement can render instead of suspending forever. This is the
      // ONLY thing that can settle the client's deferred promise.
      expect(body).toMatch(/E\d+:/);
    },
    30_000,
  );

  test("aborts pending boundaries only after turbo-stream can reject the deferred", () => {
    // Ordering invariant. If ABORT_DELAY drops to/below streamTimeout, React
    // truncates the document before turbo-stream's error chunk is flushed; the
    // client's deferred then never settles and <Await> hangs forever behind
    // "Loading results..." (React #419). Verified empirically: ABORT_DELAY of
    // 3000 against a 4950 streamTimeout reproduces exactly that hang.
    expect(entryServer.streamTimeout).toBeLessThan(entryServer.ABORT_DELAY);
  });
});
