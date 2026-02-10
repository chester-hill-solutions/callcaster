import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase.server";
import { env } from "./env.server";
import type { Database } from "./database.types";
import { createHash, timingSafeEqual } from "crypto";

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

export type ApiKeyAuthResult = {
  authType: "api_key";
  workspaceId: string;
  supabase: ReturnType<typeof createClient<Database>>;
};

export type SessionAuthResult = {
  authType: "session";
  supabaseClient: ReturnType<typeof createClient<Database>>;
  user: { id: string; email?: string; [key: string]: unknown };
};

export type AuthErrorResult = {
  error: string;
  status: 401;
};

export type VerifyApiKeyOrSessionResult =
  | ApiKeyAuthResult
  | SessionAuthResult
  | AuthErrorResult;

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

    supabase
      .from("workspace_api_key")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id)
      .then(() => {})
      .catch(() => {});

    return {
      authType: "api_key",
      workspaceId: row.workspace_id,
      supabase,
    };
  }

  const { supabaseClient, headers } = createSupabaseServerClient(request);
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
    user: user as { id: string; email?: string; [key: string]: unknown },
  };
}

export function hashApiKeyForStorage(key: string): string {
  return hashApiKey(key);
}

export const API_KEY_PREFIX_LENGTH = KEY_PREFIX_LENGTH;
