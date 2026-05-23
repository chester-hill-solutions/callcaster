import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data as routeData } from "react-router";
import { randomBytes } from "crypto";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { API_KEY_PREFIX_LENGTH, hashApiKeyForStorage } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

const KEY_SECRET_LENGTH = 32;

const KEY_PREFIX = "cc_live_";

function generateApiKey(
  hashApiKeyForStorage: (key: string) => string,
  apiKeyPrefixLength: number,
): { key: string; keyPrefix: string; keyHash: string } {
  const secret = randomBytes(KEY_SECRET_LENGTH).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  const keyPrefix = key.slice(0, apiKeyPrefixLength);
  const keyHash = hashApiKeyForStorage(key);
  return { key, keyPrefix, keyHash };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {




  const { supabaseClient, user } = await verifyAuth(request);
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id");

  if (!workspaceId) {
    return routeData(
      { error: "workspace_id is required" },
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  await requireWorkspaceAccess({
    supabaseClient,
    user,
    workspaceId,
  });

  const { data: keys, error } = await supabaseClient
    .from("workspace_api_key")
    .select("id, name, key_prefix, created_at, last_used_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Error listing API keys:", error);
    return routeData(
      { error: error.message },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return routeData(
    { keys: keys ?? [] },
    { headers: { "Content-Type": "application/json" } }
  );
}
