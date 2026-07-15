import { authTrustedOrigins } from "@chester-hill-solutions/auth/origin";
import { env, isProduction } from "@/lib/env.server";

function addUrlOrigin(origins: Set<string>, value: string | undefined): void {
  if (!value?.trim()) return;
  try {
    origins.add(new URL(value.trim()).origin);
  } catch {
    // Ignore invalid URLs; callers may pass raw origin strings via env lists.
  }
}

function addOriginList(origins: Set<string>, raw: string | undefined): void {
  if (!raw) return;
  for (const part of raw.split(/[,;\s]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      origins.add(trimmed.replace(/\/$/, ""));
    }
  }
}

/**
 * Static origins Better Auth may accept for CSRF / redirect checks.
 *
 * CallCaster often sets `BASE_URL` to a Localtunnel/Railway public URL while the
 * browser still posts from loopback — include those configured URLs plus optional
 * `APP_TRUSTED_ORIGINS` / `BETTER_AUTH_TRUSTED_ORIGINS` lists.
 */
export function resolveStaticAuthTrustedOrigins(): string[] {
  const origins = new Set<string>();

  addUrlOrigin(origins, env.BETTER_AUTH_URL());
  addUrlOrigin(origins, env.BASE_URL());

  for (const origin of authTrustedOrigins(env.BASE_URL())) {
    addUrlOrigin(origins, origin);
  }

  addOriginList(origins, process.env.APP_TRUSTED_ORIGINS);
  addOriginList(origins, process.env.BETTER_AUTH_TRUSTED_ORIGINS);

  if (!isProduction()) {
    const port = process.env.PORT?.trim() || "3000";
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
    if (port !== "3000") {
      origins.add("http://localhost:3000");
      origins.add("http://127.0.0.1:3000");
    }
  }

  return [...origins];
}

function headersFromTrustedOriginsInput(
  request: Request | Headers | undefined,
): Headers | null {
  if (!request) return null;
  if (request instanceof Headers) return request;
  return request.headers;
}

/**
 * Per-request trusted origins: static list plus the host the browser actually hit.
 *
 * Trusting Host (and forwarded host/proto) only allows same-origin posts — a
 * cross-site attacker still sends `Origin: https://evil.example`, which will not
 * match the Host-derived origin.
 */
export async function resolveAuthTrustedOrigins(
  request?: Request | Headers,
): Promise<string[]> {
  const origins = new Set(resolveStaticAuthTrustedOrigins());
  const headers = headersFromTrustedOriginsInput(request);

  let host: string | null = null;
  let proto: string | null = null;

  if (headers) {
    host =
      headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      headers.get("host");
    proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || null;
  }

  if (request instanceof Request) {
    try {
      const url = new URL(request.url);
      host ??= url.host;
      proto ??= url.protocol.replace(/:$/, "");
    } catch {
      // ignore malformed request URL
    }
  }

  if (host) {
    if (proto === "http" || proto === "https") {
      origins.add(`${proto}://${host}`);
    } else if (isProduction()) {
      origins.add(`https://${host}`);
    } else {
      origins.add(`http://${host}`);
      origins.add(`https://${host}`);
    }
  }

  return [...origins];
}
