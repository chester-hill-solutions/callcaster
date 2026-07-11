import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { resolve } from "node:dns/promises";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

/**
 * SSRF guard for server-side outbound fetches to user-supplied URLs (e.g. webhook tests).
 *
 * The naive pattern — validate the hostname's DNS records, then `fetch(rawUrl)` — is
 * vulnerable to DNS-rebinding (TOCTOU): the guard's lookup and fetch's lookup are
 * independent resolutions, so an attacker with a low-TTL record can answer the guard with a
 * public IP and answer fetch with a private/metadata IP (169.254.169.254, etc.).
 *
 * `safeOutboundFetch` closes that hole by resolving the host ONCE, validating the resulting
 * address, and then pinning the outbound connection to that exact IP via a custom `lookup`
 * on `node:http`/`node:https`. There is no second DNS resolution at connect time, so the
 * address that was validated is guaranteed to be the address that is dialed.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

/** Upper bound on DNS resolution so a hostile/slow authoritative nameserver
 * can't hold the request handler open past the outbound timeout. */
const DNS_RESOLVE_TIMEOUT_MS = 5_000;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return false;
  }
  const [a, b = -1] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * If `host` is an IPv4-mapped/compatible IPv6 address (`::ffff:169.254.169.254`
 * or its hex form `::ffff:a9fe:a9fe`, and `::a.b.c.d`), return the embedded
 * dotted IPv4. Attackers use these to smuggle a private/metadata IPv4 past an
 * IPv6-only check. Returns null when there is no embedded IPv4.
 */
function embeddedIpv4(host: string): string | null {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  // Dotted tail: ::ffff:169.254.169.254 or ::169.254.169.254
  const dotted = normalized.match(/:((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dotted?.[1]) return dotted[1];
  // Hex-mapped: ::ffff:a9fe:a9fe
  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex?.[1] && hex[2]) {
    const hi = Number.parseInt(hex[1], 16);
    const lo = Number.parseInt(hex[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  // Any IPv4 smuggled inside an IPv6 literal is judged by IPv4 rules.
  const mapped = embeddedIpv4(normalized);
  if (mapped) return isPrivateIpv4(mapped) || mapped === "169.254.169.254";
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80")
  );
}

function isPrivateOrMetadataIp(ip: string): boolean {
  if (ip === "169.254.169.254") return true;
  // Unwrap IPv4-mapped IPv6 first so a mapped private/metadata IPv4 can't pass
  // as a "public" IPv6 address.
  const mapped = embeddedIpv4(ip);
  if (mapped) return isPrivateIpv4(mapped) || mapped === "169.254.169.254";
  if (isIP(ip) === 4) return isPrivateIpv4(ip);
  if (isIP(ip) === 6) return isPrivateIpv6(ip);
  // Unknown / unparseable address: fail closed.
  return true;
}

export interface SafeOutboundTarget {
  /** The validated destination URL (hostname unchanged from the caller's input). */
  url: URL;
  /** Pre-validated public IP addresses the host resolves to. `addresses[0]` is pinned. */
  addresses: string[];
}

/**
 * Parse, validate and resolve a user-supplied outbound URL.
 *
 * Rejects non-http(s) schemes, blocked/loopback/link-local hostnames, `.local`/`.internal`
 * suffixes, hosts that resolve to no records, and hosts that resolve to any
 * private/metadata/loopback address. On success returns the URL together with the exact set
 * of validated IP addresses, so the caller can pin its connection instead of re-resolving.
 */
export async function resolveSafeOutboundTarget(rawUrl: string): Promise<SafeOutboundTarget> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid destination URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Destination URL must use http or https");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("Destination URL host is not allowed");
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Destination URL host is not allowed");
  }

  if (isIP(hostname)) {
    if (isPrivateOrMetadataIp(hostname)) {
      throw new Error("Destination URL host is not allowed");
    }
    return { url: parsed, addresses: [hostname] };
  }

  const records: string[] = [];
  try {
    records.push(
      ...(await withTimeout(resolve(hostname, "A"), DNS_RESOLVE_TIMEOUT_MS, "DNS A resolve")),
    );
  } catch {
    // host may only have AAAA records (or the A lookup timed out)
  }
  try {
    records.push(
      ...(await withTimeout(resolve(hostname, "AAAA"), DNS_RESOLVE_TIMEOUT_MS, "DNS AAAA resolve")),
    );
  } catch {
    // host may only have A records (or the AAAA lookup timed out)
  }

  if (records.length === 0) {
    throw new Error("Destination URL host is not allowed");
  }

  for (const ip of records) {
    if (isPrivateOrMetadataIp(ip)) {
      throw new Error("Destination URL host is not allowed");
    }
  }

  return { url: parsed, addresses: records };
}

/**
 * Back-compat guard: validate a URL and return it. Prefer {@link safeOutboundFetch} for the
 * validate-then-fetch flow, since this on its own is still exposed to DNS rebinding if the
 * caller subsequently fetches the raw URL (the very TOCTOU this module exists to prevent).
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  const { url } = await resolveSafeOutboundTarget(rawUrl);
  return url;
}

export interface SafeOutboundFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Abort signal, e.g. `AbortSignal.timeout(10000)`. */
  signal?: AbortSignal;
}

/**
 * Perform an outbound HTTP(S) request to a user-supplied URL with full SSRF protection.
 *
 * The host is resolved and validated exactly once; the connection is then pinned to the
 * validated IP through a custom `lookup`, eliminating the rebind window. The original Host
 * header and TLS SNI are preserved (the URL's hostname is left intact and only the socket's
 * lookup is overridden), so certificate validation still runs against the real hostname.
 * Redirects are treated as errors — matching the previous `fetch(redirect: "error")`
 * contract — so a 3xx cannot bounce the request onto a rebind target.
 *
 * Returns a standard {@link Response} so existing callers can keep using `.status`,
 * `.statusText`, `.headers` and `.json()`/`.text()` unchanged.
 */
export async function safeOutboundFetch(
  rawUrl: string,
  init: SafeOutboundFetchInit = {},
): Promise<Response> {
  const { url, addresses } = await resolveSafeOutboundTarget(rawUrl);
  const pinnedIp = addresses[0];
  if (!pinnedIp) {
    // Unreachable: resolveSafeOutboundTarget rejects empty results. Fail closed anyway.
    throw new Error("Destination URL host is not allowed");
  }
  const pinnedFamily = isIP(pinnedIp);

  // Custom lookup: never performs DNS. Always returns the address validated above, and
  // re-checks it (defense in depth) so a poisoned `addresses[0]` still cannot be dialed.
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (pinnedFamily === 0 || isPrivateOrMetadataIp(pinnedIp)) {
      callback(new Error("Destination resolved to a disallowed address"), "", 0);
      return;
    }
    if (options && typeof options === "object" && (options as { all?: boolean }).all) {
      // Node's typings don't model the `{ all: true }` overload on LookupFunction.
      (callback as unknown as (
        err: NodeJS.ErrnoException | null,
        addresses: Array<{ address: string; family: number }>,
      ) => void)(null, [{ address: pinnedIp, family: pinnedFamily }]);
      return;
    }
    callback(null, pinnedIp, pinnedFamily);
  };

  const isHttps = url.protocol === "https:";
  const requestImpl = isHttps ? httpsRequest : httpRequest;

  return await new Promise<Response>((resolvePromise, rejectPromise) => {
    const req = requestImpl(
      url,
      {
        method: init.method ?? "GET",
        headers: init.headers,
        lookup,
        // Preserve SNI / cert hostname against the real host, not the pinned IP.
        servername: isHttps ? url.hostname : undefined,
        signal: init.signal,
      },
      (res) => {
        // Belt-and-suspenders: confirm the socket actually connected to a validated address.
        const remote = res.socket?.remoteAddress;
        if (remote && isPrivateOrMetadataIp(remote)) {
          res.destroy();
          rejectPromise(new Error("Destination connected to a disallowed address"));
          return;
        }

        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.destroy();
          rejectPromise(new Error("Destination URL responded with a redirect"));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (Array.isArray(value)) {
              for (const v of value) headers.append(key, v);
            } else if (value != null) {
              headers.set(key, value);
            }
          }
          const body = Buffer.concat(chunks);
          resolvePromise(
            new Response(body.length > 0 ? body : null, {
              status: status || 200,
              statusText: res.statusMessage ?? "",
              headers,
            }),
          );
        });
        res.on("error", rejectPromise);
      },
    );

    req.on("error", rejectPromise);
    if (init.body !== undefined) {
      req.write(init.body);
    }
    req.end();
  });
}
