import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { safeOutboundFetch } from "../app/lib/safe-outbound-url.server";

type ResponseFixture = PassThrough & {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  socket: { remoteAddress: string };
};
type RequestFixture = EventEmitter & {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};
type Fixtures = { response?: ResponseFixture; request?: RequestFixture };

const fixtures = vi.hoisted((): Fixtures => ({}));
const mocks = vi.hoisted(() => ({ request: vi.fn(), resolve: vi.fn() }));
vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("node:dns/promises", () => ({ resolve: mocks.resolve }));

function response() {
  if (!fixtures.response) throw new Error("Missing response fixture");
  return fixtures.response;
}
function request() {
  if (!fixtures.request) throw new Error("Missing request fixture");
  return fixtures.request;
}

beforeEach(() => {
  fixtures.request = undefined;
  fixtures.response = Object.assign(new PassThrough(), {
    statusCode: 200,
    statusMessage: "OK",
    headers: { "content-type": "text/plain" },
    socket: { remoteAddress: "93.184.216.34" },
  });
  mocks.resolve.mockReset();
  mocks.resolve.mockImplementation(async (_host: string, type: string) => {
    if (type === "A") return ["93.184.216.34"];
    throw new Error("No AAAA record");
  });
  mocks.request.mockReset();
  mocks.request.mockImplementation(
    (
      _url: URL,
      options: Record<string, unknown>,
      callback: (res: ResponseFixture) => void,
    ) => {
      const req = Object.assign(new EventEmitter(), {
        write: vi.fn(),
        destroy: vi.fn(),
        end: vi.fn(() => queueMicrotask(() => callback(response()))),
      });
      fixtures.request = req;
      const signal = options.signal;
      if (signal instanceof AbortSignal) {
        signal.addEventListener(
          "abort",
          () => req.emit("error", new Error("Request aborted")),
          { once: true },
        );
      }
      return req;
    },
  );
});

async function start(signal?: AbortSignal) {
  const pending = safeOutboundFetch("https://example.com/hook", { signal });
  // Attach an error handler before starting the controlled stream.
  void pending.catch(() => {});
  await vi.waitFor(() => expect(response().listenerCount("data")).toBe(1));
  return { pending };
}

describe("outbound responses have a one MiB byte limit", () => {
  test("a response exactly at the limit succeeds", async () => {
    const { pending } = await start();
    response().write(Buffer.alloc(524_288, "a"));
    response().end(Buffer.alloc(524_288, "b"));
    const result = await pending;
    expect(result.status).toBe(200);
    expect((await result.arrayBuffer()).byteLength).toBe(1_048_576);
    expect(request().destroy).not.toHaveBeenCalled();
  });

  test("one oversized chunk rejects and closes both resources", async () => {
    const { pending } = await start();
    response().end(Buffer.alloc(1_048_577));
    await expect(pending).rejects.toThrow("Destination response too large");
    expect(response().destroyed).toBe(true);
    expect(request().destroy).toHaveBeenCalledOnce();
  });

  test("a growing response is stopped on the first byte above the limit", async () => {
    const { pending } = await start();
    response().write(Buffer.alloc(524_288));
    response().write(Buffer.alloc(524_288));
    expect(response().destroyed).toBe(false);
    response().write(Buffer.from("x"));
    await expect(pending).rejects.toThrow("Destination response too large");
    expect(response().destroyed).toBe(true);
    expect(request().destroy).toHaveBeenCalledOnce();
    // A late end event must not concatenate the retained chunks after rejection.
    const concat = vi.spyOn(Buffer, "concat");
    try {
      response().emit("end");
      expect(concat).not.toHaveBeenCalled();
    } finally {
      concat.mockRestore();
    }
  });

  test("a response stream error also closes the request", async () => {
    const { pending } = await start();
    response().write(Buffer.from("partial"));
    response().emit("error", new Error("Stream failed"));
    await expect(pending).rejects.toThrow("Stream failed");
    expect(response().destroyed).toBe(true);
    expect(request().destroy).toHaveBeenCalledOnce();
  });

  test("an abort closes an active response as well as the request", async () => {
    const controller = new AbortController();
    const { pending } = await start(controller.signal);
    response().write(Buffer.from("partial"));
    controller.abort();
    await expect(pending).rejects.toThrow("Request aborted");
    expect(response().destroyed).toBe(true);
    expect(request().destroy).toHaveBeenCalledOnce();
  });

  test("a prematurely aborted response rejects without waiting for end", async () => {
    const { pending } = await start();
    response().emit("aborted");
    await expect(pending).rejects.toThrow("Destination response aborted");
    expect(response().destroyed).toBe(true);
    expect(request().destroy).toHaveBeenCalledOnce();
  });

  test("a rejected redirect closes the request and response", async () => {
    response().statusCode = 302;
    response().headers = { location: "http://169.254.169.254/" };
    await expect(safeOutboundFetch("https://example.com/hook")).rejects.toThrow(
      /redirect/i,
    );
    expect(response().destroyed).toBe(true);
    expect(request().destroy).toHaveBeenCalledOnce();
  });

  test("a disallowed connected address closes the request and response", async () => {
    response().socket.remoteAddress = "10.0.0.1";
    await expect(safeOutboundFetch("https://example.com/hook")).rejects.toThrow(
      /disallowed/i,
    );
    expect(response().destroyed).toBe(true);
    expect(request().destroy).toHaveBeenCalledOnce();
  });
});
