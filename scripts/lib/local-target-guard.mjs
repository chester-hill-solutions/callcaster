/* eslint-env node */
/**
 * Refuse to point compose-only destructive scripts (schema reset, bucket
 * purge) at anything but the local stack. There is deliberately no override:
 * a real database or bucket must never be reachable from these paths.
 */
const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  // docker-compose.dev.yml service names, for callers running inside the network.
  "postgres",
  "minio",
]);

export function isLocalTargetHost(hostname) {
  const host = String(hostname ?? "").toLowerCase();
  return LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Throws unless `url` (a database URL or S3 endpoint) targets the local stack. */
export function assertLocalTarget(url, label) {
  const host = hostOf(url);
  if (host === null) {
    throw new Error(`[local-target-guard] ${label} is not a parseable URL; refusing to continue`);
  }
  if (!isLocalTargetHost(host)) {
    throw new Error(
      `[local-target-guard] ${label} points at "${host}", which is not the local compose stack. ` +
        "This script drops schemas or purges buckets and only ever runs against localhost.",
    );
  }
}
