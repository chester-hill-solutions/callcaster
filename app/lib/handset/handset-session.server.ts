import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { handset_session as handsetSessionTable } from "@/db/schema";
import { getHandsetNumberForWorkspace } from "@/lib/database.server";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";
import { getAgentStatus } from "@/lib/agent-status.server";
import { createTenantDb } from "@/server/tenant-db";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/server/db";

export const SESSION_EXPIRY_MINUTES = 60;

type AgentStatusRow = Awaited<ReturnType<typeof getAgentStatus>>;

export type HandsetLoaderData = {
  handsetNumber: string | null;
  clientIdentity: string;
  workspaceId: string;
  token: string | null;
  tokenError: string | null;
  agentStatus: AgentStatusRow;
  userId: string;
};

export async function getHandsetLoaderData({
  supabaseClient,
  user,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  user: { id: string };
  workspaceId: string;
}): Promise<HandsetLoaderData> {
  const tdb = createTenantDb(workspaceId);
  const { data: handsetData } = await getHandsetNumberForWorkspace({
    workspaceId,
    tdb,
  });

  const agentStatus = await getAgentStatus(workspaceId, user.id, tdb);

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
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000,
  ).toISOString();

  await tdb.handset_session.insert({
    id: crypto.randomUUID(),
    user_id: user.id,
    client_identity: clientIdentity,
    status: "active",
    created_at: now,
    expires_at: expiresAt,
  });

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

export async function findActiveHandsetSessionClientIdentity(
  workspaceId: string,
): Promise<string | null> {
  const now = new Date().toISOString();
  const [session] = await db
    .select({ client_identity: handsetSessionTable.client_identity })
    .from(handsetSessionTable)
    .where(
      and(
        eq(handsetSessionTable.workspace_id, workspaceId),
        eq(handsetSessionTable.status, "active"),
        gte(handsetSessionTable.expires_at, now),
      ),
    )
    .orderBy(desc(handsetSessionTable.created_at))
    .limit(1);

  return session?.client_identity ?? null;
}

export async function endHandsetSession({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<void> {
  const tdb = createTenantDb(workspaceId);
  await tdb.handset_session.update({
    set: { status: "ended" },
    where: and(
      eq(handsetSessionTable.user_id, userId),
      eq(handsetSessionTable.status, "active"),
    ),
  });
}
