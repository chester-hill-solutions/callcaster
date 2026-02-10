import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import {
  hashApiKeyForStorage,
  API_KEY_PREFIX_LENGTH,
} from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { randomBytes } from "crypto";

const KEY_SECRET_LENGTH = 32;
const KEY_PREFIX = "cc_live_";

function generateApiKey(): { key: string; keyPrefix: string; keyHash: string } {
  const secret = randomBytes(KEY_SECRET_LENGTH).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  const keyPrefix = key.slice(0, API_KEY_PREFIX_LENGTH);
  const keyHash = hashApiKeyForStorage(key);
  return { key, keyPrefix, keyHash };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient, user } = await verifyAuth(request);
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id");

  if (!workspaceId) {
    return json(
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
    return json(
      { error: error.message },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return json(
    { keys: keys ?? [] },
    { headers: { "Content-Type": "application/json" } }
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, user } = await verifyAuth(request);

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({})) as {
      workspace_id?: string;
      name?: string;
    };
    const { workspace_id, name } = body;

    if (!workspace_id || !name?.trim()) {
      return json(
        { error: "workspace_id and name are required" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await requireWorkspaceAccess({
      supabaseClient,
      user,
      workspaceId: workspace_id,
    });

    const { key, keyPrefix, keyHash } = generateApiKey();

    const { data: row, error } = await supabaseClient
      .from("workspace_api_key")
      .insert({
        workspace_id,
        name: name.trim(),
        key_prefix: keyPrefix,
        key_hash: keyHash,
        created_by: user.id,
      })
      .select("id, name, key_prefix, created_at")
      .single();

    if (error) {
      logger.error("Error creating API key:", error);
      return json(
        { error: error.message },
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return json(
      { key, id: row.id, name: row.name, key_prefix: row.key_prefix, created_at: row.created_at },
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  }

  if (request.method === "DELETE") {
    const body = await request.json().catch(() => ({})) as {
      id?: string;
      workspace_id?: string;
    };
    const { id, workspace_id } = body;

    if (!id || !workspace_id) {
      return json(
        { error: "id and workspace_id are required" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await requireWorkspaceAccess({
      supabaseClient,
      user,
      workspaceId: workspace_id,
    });

    const { error } = await supabaseClient
      .from("workspace_api_key")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspace_id);

    if (error) {
      logger.error("Error deleting API key:", error);
      return json(
        { error: error.message },
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return json(
      { success: true },
      { headers: { "Content-Type": "application/json" } }
    );
  }

  return json(
    { error: "Method not allowed" },
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
};
