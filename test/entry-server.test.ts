import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

const isbotMock = vi.hoisted(() => ({ isbot: vi.fn() }));
vi.mock("isbot", () => ({ isbot: isbotMock.isbot }));

const loggerMock = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/logger.server", () => ({ logger: loggerMock }));

type RenderOpts = {
  onAllReady?: () => void;
  onShellReady?: () => void;
  onShellError?: (e: unknown) => void;
  onError?: (e: unknown) => void;
};

let lastRenderOpts: RenderOpts | null = null;
let lastAbort: (() => void) | null = null;
let lastPipe: ((dest: any) => void) | null = null;

vi.mock("react-dom/server", () => {
  return {
    renderToPipeableStream: (_element: unknown, opts: RenderOpts) => {
      lastRenderOpts = opts;
      lastAbort = vi.fn();
      lastPipe = vi.fn();
      return { abort: lastAbort, pipe: lastPipe };
    },
  };
});

describe("app/entry.server", () => {
  beforeEach(() => {
    isbotMock.isbot.mockReset();
    loggerMock.error.mockReset();
    lastRenderOpts = null;
    lastAbort = null;
    lastPipe = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  test("routes bots to onAllReady and browsers to onShellReady", async () => {
    const mod = await import("../app/entry.server");
    const headers = new Headers();

    isbotMock.isbot.mockReturnValueOnce(true);
    const botPromise = mod.default(
      new Request("http://localhost/", { headers: { "user-agent": "bot" } }),
      200,
      headers,
      {} as any,
      {} as any,
    );
    expect(lastRenderOpts).not.toBeNull();
    lastRenderOpts!.onAllReady?.();
    const botRes = await botPromise;
    expect(botRes.status).toBe(200);
    expect(headers.get("Content-Type")).toBe("text/html");
    expect(lastPipe).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const mod2 = await import("../app/entry.server");
    const headers2 = new Headers();
    isbotMock.isbot.mockReturnValueOnce(false);
    const browserPromise = mod2.default(
      new Request("http://localhost/", { headers: { "user-agent": "browser" } }),
      200,
      headers2,
      {} as any,
      {} as any,
    );
    expect(lastRenderOpts).not.toBeNull();
    lastRenderOpts!.onShellReady?.();
    const browserRes = await browserPromise;
    expect(browserRes.status).toBe(200);
    expect(headers2.get("Content-Type")).toBe("text/html");
  });

  test("rejects when onShellError is called", async () => {
    isbotMock.isbot.mockReturnValueOnce(false);
    const mod = await import("../app/entry.server");
    const p = mod.default(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as any,
      {} as any,
    );
    lastRenderOpts!.onShellError?.(new Error("boom"));
    await expect(p).rejects.toThrow("boom");
  });

  test("rejects bot rendering when onShellError is called", async () => {
    isbotMock.isbot.mockReturnValueOnce(true);
    const mod = await import("../app/entry.server");
    const p = mod.default(
      new Request("http://localhost/", { headers: { "user-agent": "bot" } }),
      200,
      new Headers(),
      {} as any,
      {} as any,
    );
    lastRenderOpts!.onShellError?.(new Error("bot-shell-error"));
    await expect(p).rejects.toThrow("bot-shell-error");
  });

  test("logs streaming errors only after shell is rendered", async () => {
    isbotMock.isbot.mockReturnValueOnce(true);
    const mod = await import("../app/entry.server");
    const p = mod.default(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as any,
      {} as any,
    );

    // Before the shell is ready, errors should not be logged.
    lastRenderOpts!.onError?.(new Error("early"));
    expect(loggerMock.error).not.toHaveBeenCalled();

    // After all-ready, errors should be logged.
    lastRenderOpts!.onAllReady?.();
    await p;
    lastRenderOpts!.onError?.(new Error("late"));
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });

  test("logs streaming errors after browser shell is rendered", async () => {
    isbotMock.isbot.mockReturnValueOnce(false);
    const mod = await import("../app/entry.server");
    const p = mod.default(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as any,
      {} as any,
    );

    lastRenderOpts!.onShellReady?.();
    await p;
    lastRenderOpts!.onError?.(new Error("browser-late"));
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });

  test("does not log browser streaming errors before shell is rendered", async () => {
    isbotMock.isbot.mockReturnValueOnce(false);
    const mod = await import("../app/entry.server");
    const p = mod.default(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as any,
      {} as any,
    );

    lastRenderOpts!.onError?.(new Error("browser-early"));
    expect(loggerMock.error).not.toHaveBeenCalled();

    lastRenderOpts!.onShellReady?.();
    await p;
  });

  test("schedules abort after ABORT_DELAY", async () => {
    isbotMock.isbot.mockReturnValueOnce(false);
    const mod = await import("../app/entry.server");
    const p = mod.default(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as any,
      {} as any,
    );

    // Resolving is required so timers don't keep the promise pending.
    lastRenderOpts!.onShellReady?.();
    await p;

    expect(lastAbort).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5_000);
    expect(lastAbort).toHaveBeenCalledTimes(1);
  });
});

