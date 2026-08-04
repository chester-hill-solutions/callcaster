import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

const isbotMock = vi.hoisted(() => ({ isbot: vi.fn() }));
vi.mock("isbot", () => ({ isbot: isbotMock.isbot }));

const loggerMock = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/logger.server", () => ({ logger: loggerMock }));

type RenderOpts = {
  signal?: AbortSignal;
  onError?: (e: unknown) => void;
};

let lastRenderOpts: RenderOpts | null = null;
let renderImpl: (opts: RenderOpts) => Promise<ReadableStream & { allReady?: Promise<void> }>;
let allReadyResolve: (() => void) | null = null;

function makeStream(): ReadableStream & { allReady: Promise<void> } {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("<html/>"));
      controller.close();
    },
  }) as ReadableStream & { allReady: Promise<void> };
  stream.allReady = new Promise<void>((resolve) => {
    allReadyResolve = resolve;
  });
  return stream;
}

vi.mock("react-dom/server", () => {
  return {
    renderToReadableStream: (_element: unknown, opts: RenderOpts) => {
      lastRenderOpts = opts;
      return renderImpl(opts);
    },
  };
});

describe("app/entry.server", () => {
  beforeEach(() => {
    isbotMock.isbot.mockReset();
    loggerMock.error.mockReset();
    lastRenderOpts = null;
    allReadyResolve = null;
    renderImpl = async () => makeStream();
  });

  afterEach(() => {
    vi.resetModules();
  });

  test("browsers get the response as soon as the shell resolves", async () => {
    isbotMock.isbot.mockReturnValueOnce(false);
    const mod = await import("../app/entry.server");
    const headers = new Headers();

    const res = await mod.default(
      new Request("http://localhost/", { headers: { "user-agent": "browser" } }),
      200,
      headers,
      {} as any,
      {} as any,
    );

    expect(res.status).toBe(200);
    expect(headers.get("Content-Type")).toBe("text/html");
    expect(res.body).not.toBeNull();
  });

  test("bots wait for allReady before the response resolves", async () => {
    isbotMock.isbot.mockReturnValueOnce(true);
    const mod = await import("../app/entry.server");

    let settled = false;
    const p = mod
      .default(
        new Request("http://localhost/", { headers: { "user-agent": "bot" } }),
        200,
        new Headers(),
        {} as any,
        {} as any,
      )
      .then((res) => {
        settled = true;
        return res;
      });

    // Give the microtask queue a chance: without allReady resolving, the
    // bot response must still be pending.
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);

    allReadyResolve?.();
    const res = await p;
    expect(res.status).toBe(200);
  });

  test("rejects when the shell render rejects", async () => {
    isbotMock.isbot.mockReturnValueOnce(false);
    renderImpl = async () => {
      throw new Error("boom");
    };
    const mod = await import("../app/entry.server");

    await expect(
      mod.default(
        new Request("http://localhost/"),
        200,
        new Headers(),
        {} as any,
        {} as any,
      ),
    ).rejects.toThrow("boom");
  });

  test("logs streaming errors only after the shell resolved", async () => {
    isbotMock.isbot.mockReturnValueOnce(false);
    const mod = await import("../app/entry.server");

    const res = await mod.default(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as any,
      {} as any,
    );
    expect(res.status).toBe(200);

    // Post-shell streaming error → logged.
    lastRenderOpts!.onError?.(new Error("late"));
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });

  test("does not log errors raised before the shell resolves", async () => {
    isbotMock.isbot.mockReturnValueOnce(false);
    renderImpl = async (opts) => {
      // Error fires during shell rendering, before the promise resolves.
      opts.onError?.(new Error("early"));
      throw new Error("shell failed");
    };
    const mod = await import("../app/entry.server");

    await expect(
      mod.default(
        new Request("http://localhost/"),
        200,
        new Headers(),
        {} as any,
        {} as any,
      ),
    ).rejects.toThrow("shell failed");
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  test("streaming errors set a 500 status for late renders", async () => {
    isbotMock.isbot.mockReturnValueOnce(true);
    renderImpl = async (opts) => {
      const stream = makeStream();
      // Error during the post-shell (bot allReady) phase, before response returns.
      queueMicrotask(() => {
        opts.onError?.(new Error("suspense failed"));
        allReadyResolve?.();
      });
      return stream;
    };
    const mod = await import("../app/entry.server");

    const res = await mod.default(
      new Request("http://localhost/", { headers: { "user-agent": "bot" } }),
      200,
      new Headers(),
      {} as any,
      {} as any,
    );
    expect(res.status).toBe(500);
  });

  test("passes an abort signal, and clears the timer once the response completes", async () => {
    vi.useFakeTimers();
    try {
      isbotMock.isbot.mockReturnValueOnce(false);
      const mod = await import("../app/entry.server");

      const res = await mod.default(
        new Request("http://localhost/"),
        200,
        new Headers(),
        {} as any,
        {} as any,
      );
      expect(res.status).toBe(200);

      expect(lastRenderOpts?.signal).toBeInstanceOf(AbortSignal);
      expect(lastRenderOpts!.signal!.aborted).toBe(false);
      // The abort timer is cleared in `finally`, so a completed fast response
      // is never aborted after the fact (no leaked timer firing on a closed
      // stream).
      vi.advanceTimersByTime(5_000);
      expect(lastRenderOpts!.signal!.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a slow-Suspense abort keeps the bot response at 200, not 500", async () => {
    isbotMock.isbot.mockReturnValueOnce(true);
    renderImpl = async (opts) => {
      const stream = makeStream();
      queueMicrotask(() => {
        // Simulate ABORT_DELAY firing: the render's own signal is aborted and
        // React then reports that abort via onError. The shell already
        // streamed, so entry.server must keep the 200.
        opts.signal?.dispatchEvent?.(new Event("abort"));
        Object.defineProperty(opts.signal!, "aborted", {
          value: true,
          configurable: true,
        });
        opts.onError?.(new DOMException("The operation was aborted", "AbortError"));
        allReadyResolve?.();
      });
      return stream;
    };
    const mod = await import("../app/entry.server");

    const res = await mod.default(
      new Request("http://localhost/", { headers: { "user-agent": "bot" } }),
      200,
      new Headers(),
      {} as any,
      {} as any,
    );
    expect(res.status).toBe(200);
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});
