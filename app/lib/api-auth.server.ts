import { createHash, timingSafeEqual } from "crypto";
import { getSession, resolveBearerSessionUser } from "./auth.server";
import { jsonError } from "./platform-api.server";
import {
  findWorkspaceApiKeyByPrefix,
  getUserById,
  touchWorkspaceApiKeyLastUsed,
} from "@/lib/workspace-members-db.server";

const KEY_PREFIX_LENGTH = 10;

function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || token.startsWith("cc_")) {
    return null;
  }
  return token;
}

export type ApiKeyAuthResult = {
  authType: "api_key";
  workspaceId: string;
};

export type BearerSessionAuthResult = {
  authType: "bearer";
  user: { id: string; email?: string };
  accessToken: string;
};

export type SessionAuthResult = {
  authType: "session";
  user: { id: string; email?: string };
};

export type AuthErrorResult = {
  error: string;
  status: 401;
};

export type VerifyApiKeyOrSessionResult =
  | ApiKeyAuthResult
  | BearerSessionAuthResult
  | SessionAuthResult
  | AuthErrorResult;

export type VerifyBearerOrSessionResult =
  | BearerSessionAuthResult
  | SessionAuthResult
  | AuthErrorResult;

async function resolveBearerSession(
  accessToken: string,
): Promise<BearerSessionAuthResult | AuthErrorResult> {
  const user = await resolveBearerSessionUser(accessToken);
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }

  return {
    authType: "bearer",
    user: { id: user.id, email: user.email },
    accessToken,
  };
}

async function resolveCookieSession(
  request: Request,
): Promise<SessionAuthResult | AuthErrorResult> {
  const { user } = await getSession(request);
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }

  return {
    authType: "session",
    user: { id: user.id, email: user.email },
  };
}

export async function verifyBearerOrSession(
  request: Request,
): Promise<VerifyBearerOrSessionResult> {
  const bearer = extractBearerToken(request);
  if (bearer) {
    return resolveBearerSession(bearer);
  }
  return resolveCookieSession(request);
}

export async function verifyApiKeyOrSession(
  request: Request,
): Promise<VerifyApiKeyOrSessionResult> {
  const authHeader = request.headers.get("Authorization");
  const apiKeyHeader = request.headers.get("X-API-Key");
  const rawKey = apiKeyHeader ?? authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (rawKey?.startsWith("cc_") && rawKey.length > KEY_PREFIX_LENGTH) {
    const keyPrefix = rawKey.slice(0, KEY_PREFIX_LENGTH);
    const row = await findWorkspaceApiKeyByPrefix(keyPrefix);

    if (!row) {
      return { error: "Invalid API key", status: 401 };
    }

    const expectedHash = row.key_hash;
    const actualHash = hashApiKey(rawKey);
    if (!secureCompare(expectedHash, actualHash)) {
      return { error: "Invalid API key", status: 401 };
    }

    void Promise.resolve(touchWorkspaceApiKeyLastUsed(row.id)).catch(() => undefined);

    return {
      authType: "api_key",
      workspaceId: row.workspace_id,
    };
  }

  const bearer = extractBearerToken(request);
  if (bearer) {
    return resolveBearerSession(bearer);
  }

  return resolveCookieSession(request);
}

/** @deprecated Use verifyApiKeyOrSession — alias for dual-auth rollout. */
export const verifyApiKeyOrBearerOrSession = verifyApiKeyOrSession;

export async function requireJsonAuth(
  request: Request,
): Promise<BearerSessionAuthResult | SessionAuthResult | Response> {
  const result = await verifyBearerOrSession(request);
  if ("error" in result) {
    return jsonError(result.error, result.status);
  }
  return result;
}

export async function requireDualAuth(
  request: Request,
): Promise<
  ApiKeyAuthResult | BearerSessionAuthResult | SessionAuthResult | Response
> {
  const result = await verifyApiKeyOrSession(request);
  if ("error" in result) {
    return jsonError(result.error, result.status);
  }
  return result;
}

export function getDualAuthUser(
  auth: ApiKeyAuthResult | BearerSessionAuthResult | SessionAuthResult,
): { id: string; email?: string } | null {
  return auth.authType === "api_key" ? null : auth.user;
}

export async function requireSudo(
  request: Request,
): Promise<
  | {
      user: { id: string; email?: string };
      userData: NonNullable<Awaited<ReturnType<typeof getUserById>>>;
    }
  | Response
> {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const userData = await getUserById(auth.user.id);

  if (!userData || userData.access_level !== "sudo") {
    return jsonError("Forbidden", 403);
  }

  return { user: auth.user, userData };
}

/** Resolve dual-auth (API key or session) + headers + user. Throws Response on auth failure. */
export async function resolveDualAuthSession(request: Request) {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) {
    throw auth;
  }
  const { headers } = await getSession(request);
  return {
    headers,
    user: getDualAuthUser(auth) ?? undefined,
  };
}

/** Resolve JSON auth (bearer or session) + headers + user. Throws Response on auth failure. */
export async function resolveJsonAuthSession(request: Request) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) {
    throw auth;
  }
  const { headers } = await getSession(request);
  return {
    headers,
    user: auth.user,
  };
}

export function hashApiKeyForStorage(key: string): string {
  return hashApiKey(key);
}

export const API_KEY_PREFIX_LENGTH = KEY_PREFIX_LENGTH;
