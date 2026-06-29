import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase.server";
import { env } from "./env.server";
import type { Database } from "./database.types";
import { createHash, timingSafeEqual } from "crypto";
import { jsonError } from "./platform-api.server";

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
  supabase: ReturnType<typeof createClient<Database>>;
};

export type BearerSessionAuthResult = {
  authType: "bearer";
  supabaseClient: ReturnType<typeof createClient<Database>>;
  user: { id: string; email?: string };
  accessToken: string;
};

export type SessionAuthResult = {
  authType: "session";
  supabaseClient: ReturnType<typeof createClient<Database>>;
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
  const supabaseClient = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_PUBLISHABLE_KEY(),
    {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser(accessToken);

  if (!user || error) {
    return { error: "Unauthorized", status: 401 };
  }

  return {
    authType: "bearer",
    supabaseClient,
    user: { id: user.id, email: user.email ?? undefined },
    accessToken,
  };
}

async function resolveCookieSession(
  request: Request,
): Promise<SessionAuthResult | AuthErrorResult> {
  const { supabaseClient } = createSupabaseServerClient(request);
  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser();

  if (!user || error) {
    return { error: "Unauthorized", status: 401 };
  }

  return {
    authType: "session",
    supabaseClient,
    user: { id: user.id, email: user.email ?? undefined },
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
  request: Request
): Promise<VerifyApiKeyOrSessionResult> {
  const authHeader = request.headers.get("Authorization");
  const apiKeyHeader = request.headers.get("X-API-Key");
  const rawKey = apiKeyHeader ?? authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (rawKey?.startsWith("cc_") && rawKey.length > KEY_PREFIX_LENGTH) {
    const keyPrefix = rawKey.slice(0, KEY_PREFIX_LENGTH);
    const supabase = createClient<Database>(
      env.SUPABASE_URL(),
      env.SUPABASE_SERVICE_KEY(),
      { auth: { persistSession: false } }
    );

    const { data: row, error } = await supabase
      .from("workspace_api_key")
      .select("id, workspace_id, key_hash")
      .eq("key_prefix", keyPrefix)
      .single();

    if (error || !row) {
      return { error: "Invalid API key", status: 401 };
    }

    const expectedHash = row.key_hash;
    const actualHash = hashApiKey(rawKey);
    if (!secureCompare(expectedHash, actualHash)) {
      return { error: "Invalid API key", status: 401 };
    }

    void supabase
      .from("workspace_api_key")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);

    return {
      authType: "api_key",
      workspaceId: row.workspace_id,
      supabase,
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

export function getDualAuthSupabase(
  auth: ApiKeyAuthResult | BearerSessionAuthResult | SessionAuthResult,
): ReturnType<typeof createClient<Database>> {
  return auth.authType === "api_key" ? auth.supabase : auth.supabaseClient;
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
      supabaseClient: ReturnType<typeof createClient<Database>>;
      user: { id: string; email?: string };
      userData: Database["public"]["Tables"]["user"]["Row"];
    }
  | Response
> {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const supabaseClient = getAuthSupabaseClient(auth);
  const { data: userData, error } = await supabaseClient
    .from("user")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  if (error || !userData || userData.access_level !== "sudo") {
    return jsonError("Forbidden", 403);
  }

  return { supabaseClient, user: auth.user, userData };
}

export function getAuthSupabaseClient(
  auth: BearerSessionAuthResult | SessionAuthResult,
): ReturnType<typeof createClient<Database>> {
  return auth.supabaseClient;
}

/** Resolve dual-auth (API key or session) + headers + user. Throws Response on auth failure. */
export async function resolveDualAuthSession(request: Request) {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) {
    throw auth;
  }
  const { headers } = createSupabaseServerClient(request);
  return {
    supabaseClient: getDualAuthSupabase(auth),
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
  const { headers } = createSupabaseServerClient(request);
  return {
    supabaseClient: getAuthSupabaseClient(auth),
    headers,
    user: auth.user,
  };
}

export function hashApiKeyForStorage(key: string): string {
  return hashApiKey(key);
}

export const API_KEY_PREFIX_LENGTH = KEY_PREFIX_LENGTH;
