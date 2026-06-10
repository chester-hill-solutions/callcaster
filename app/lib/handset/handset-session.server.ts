import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/database.types";
import { getHandsetNumberForWorkspace } from "@/lib/database.server";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";
import { env } from "@/lib/env.server";
import type { User } from "@supabase/supabase-js";
import { getAgentStatus } from "@/lib/agent-status.server";

export const SESSION_EXPIRY_MINUTES = 60;

export type HandsetLoaderData = {
  handsetNumber: string | null;
  clientIdentity: string;
  workspaceId: string;
  token: string | null;
  tokenError: string | null;
  agentStatus: Tables<"agent_status"> | null;
  userId: string;
};

export async function getHandsetLoaderData({
  supabaseClient,
  user,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  user: User;
  workspaceId: string;
}): Promise<HandsetLoaderData> {
  const { data: handsetData } = await getHandsetNumberForWorkspace({
    supabaseClient,
    workspaceId,
  });

  const agentStatus = await getAgentStatus(supabaseClient, workspaceId, user.id);

  if (!handsetData?.phone_number) {
    return {
      handsetNumber: null,
      clientIdentity: "",
      workspaceId,
      token: null,
      tokenError: null,
      agentStatus,
      userId: user.id,
    };
  }

  const clientIdentity = `handset-${crypto.randomUUID()}`;
  const expiresAt = new Date(
    Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000,
  ).toISOString();

  const { error } = await supabaseClient.from("handset_session").insert({
    user_id: user.id,
    workspace_id: workspaceId,
    client_identity: clientIdentity,
    status: "active",
    expires_at: expiresAt,
  });

  if (error) {
    throw new Response("Failed to create handset session", { status: 500 });
  }

  const tokenResult = await createHandsetAccessToken({
    supabaseClient,
    workspaceId,
    clientIdentity,
  });

  return {
    handsetNumber: handsetData.phone_number,
    clientIdentity,
    workspaceId,
    token: tokenResult.token,
    tokenError: tokenResult.error,
    agentStatus,
    userId: user.id,
  };
}

export async function endHandsetSession({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<void> {
  const serviceSupabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );

  await serviceSupabase
    .from("handset_session")
    .update({ status: "ended" })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active");
}
