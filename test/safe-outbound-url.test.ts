import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, test, vi } from "vitest";

// --- Mocks -----------------------------------------------------------------
// Control DNS resolution and intercept the outbound socket so we can prove the
// connection is pinned to the pre-validated IP rather than re-resolved.

const dns = vi.hoisted(() => ({ resolve: vi.fn() }));
const https = vi.hoisted(() => ({
  // Captures the options passed to https.request for each call, plus the IP the
  // simulated socket "connected" to (derived from the pinned lookup).
  lastOptions: undefined as undefined | Record<string, unknown>,
  connectedIp: undefined as string | undefined,
  lookupAddress: undefined as string | undefined,
  // Response the fake socket should return (overridable per test).
  status: 200,
  statusMessage: "OK",
  headers: { "content-type": "application/json" } as Record<string, string>,
}));

vi.mock("node:dns/promises", () => ({ resolve: dns.resolve }));

vi.mock("node:https", () => ({
  request: (url: URL, options: Record<string, unknown>, callback: (res: unknown) => void) => {
    https.lastOptions = options;

    // Exercise the custom lookup exactly as the real socket layer would, and use
    // whatever address it hands back as the "connected" remote address.
    const lookup = options.lookup as (
      hostname: string,
      opts: { all?: boolean },
      cb: (err: Error | null, address: string, family: number) => void,
    ) => void;
    lookup(url.hostname, { all: false }, (_err, address) => {
      https.lookupAddress = address;
      https.connectedIp = address;
    });

    const req = Object.assign(new EventEmitter(), {
      write: vi.fn(),
      end: vi.fn(() => {
        queueMicrotask(() => {
          const res = Object.assign(new EventEmitter(), {
            statusCode: https.status,
            statusMessage: https.statusMessage,
            headers: https.headers,
            socket: { remoteAddress: https.connectedIp },
            destroy: vi.fn(),
          });
          callback(res);
          res.emit("data", Buffer.from(JSON.stringify({ ok: true })));
          res.emit("end");
        });
      }),
    });
    return req;
  },
}));

import {
  assertSafeOutboundUrl,
  resolveSafeOutboundTarget,
  safeOutboundFetch,
} from "../app/lib/safe-outbound-url.server";

beforeEach(() => {
  dns.resolve.mockReset();
  https.lastOptions = undefined;
  https.connectedIp = undefined;
  https.lookupAddress = undefined;
  https.status = 200;
  https.statusMessage = "OK";
  https.headers = { "content-type": "application/json" };
});

/** Default resolver: A -> value(s), AAAA -> none. */
function mockAResolves(...ips: string[]) {
  dns.resolve.mockImplementation(async (_host: string, type: string) => {
    if (type === "A") return ips;
    throw new Error("no AAAA");
  });
}

describe("safe-outbound-url", () => {
  test("allows public https URLs", async () => {
    mockAResolves("93.184.216.34");
    await expect(assertSafeOutboundUrl("https://example.com/webhook")).resolves.toHaveProperty(
      "hostname",
      "example.com",
    );
  });

  test("blocks localhost and private networks", async () => {
    await expect(assertSafeOutboundUrl("http://127.0.0.1/hook")).rejects.toThrow(/not allowed/i);
    await expect(assertSafeOutboundUrl("http://10.0.0.5/hook")).rejects.toThrow(/not allowed/i);
    await expect(assertSafeOutboundUrl("http://metadata.google.internal")).rejects.toThrow(
      /not allowed/i,
    );
  });

  test("blocks non-http schemes", async () => {
    await expect(assertSafeOutboundUrl("file:///etc/passwd")).rejects.toThrow(/http or https/i);
  });

  test("rejects a hostname that resolves to a private IP", async () => {
    mockAResolves("169.254.169.254");
    await expect(safeOutboundFetch("https://rebind.example.com/hook")).rejects.toThrow(
      /not allowed/i,
    );
    // Rejected during validation, before any outbound request was attempted.
    expect(https.lastOptions).toBeUndefined();
  });

  test("resolves and validates before connecting", async () => {
    mockAResolves("93.184.216.34");
    const target = await resolveSafeOutboundTarget("https://example.com/hook");
    expect(target.addresses).toEqual(["93.184.216.34"]);
    expect(target.url.hostname).toBe("example.com");
  });

  test("pins the connection to the validated IP and does not re-resolve", async () => {
    // First (and only legitimate) resolution returns a public IP. Any *second*
    // resolution — as a DNS-rebind attacker would serve — would return the
    // metadata IP. The pin must make that second answer unreachable.
    let aCalls = 0;
    dns.resolve.mockImplementation(async (_host: string, type: string) => {
      if (type === "A") {
        aCalls += 1;
        return aCalls === 1 ? ["93.184.216.34"] : ["169.254.169.254"];
      }
      throw new Error("no AAAA");
    });

    const res = await safeOutboundFetch("https://rebind.example.com/hook", {
      method: "POST",
      body: "{}",
    });

    // The host was resolved exactly once; connect-time used the pinned lookup, not DNS.
    expect(aCalls).toBe(1);
    // The socket-layer lookup returned the pinned public IP, never the rebind target.
    expect(https.lookupAddress).toBe("93.184.216.34");
    // The Host/SNI stayed the real hostname so TLS validation is unchanged.
    expect(https.lastOptions?.servername).toBe("rebind.example.com");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  test("treats redirects as errors so a 3xx cannot bounce to a rebind target", async () => {
    mockAResolves("93.184.216.34");
    https.status = 302;
    https.statusMessage = "Found";
    https.headers = { location: "http://169.254.169.254/" };

    await expect(safeOutboundFetch("https://redir.example.com/hook")).rejects.toThrow(/redirect/i);
  });
});
