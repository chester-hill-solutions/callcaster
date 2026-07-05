import { resolve } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard for server-side outbound fetches to user-supplied URLs (e.g. webhook tests).
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

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

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80")
  );
}

function isPrivateOrMetadataIp(ip: string): boolean {
  if (ip === "169.254.169.254") return true;
  if (isIP(ip) === 4) return isPrivateIpv4(ip);
  if (isIP(ip) === 6) return isPrivateIpv6(ip);
  return false;
}

export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
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
    return parsed;
  }

  const records: string[] = [];
  try {
    records.push(...(await resolve(hostname, "A")));
  } catch {
    // host may only have AAAA records
  }
  try {
    records.push(...(await resolve(hostname, "AAAA")));
  } catch {
    // host may only have A records
  }

  if (records.length === 0) {
    throw new Error("Destination URL host is not allowed");
  }

  for (const ip of records) {
    if (isPrivateOrMetadataIp(ip)) {
      throw new Error("Destination URL host is not allowed");
    }
  }

  return parsed;
}
