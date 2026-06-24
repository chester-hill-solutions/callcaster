import { data as routeData } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserRole } from "@/lib/database.server";
import type { Database } from "@/lib/database.types";
import { verifyAuth } from "@/lib/supabase.server";

export type WorkspaceLoaderContext = {
  supabaseClient: SupabaseClient<Database>;
  headers: Headers;
  user: { id: string };
  workspaceId: string;
  userRole: NonNullable<Awaited<ReturnType<typeof getUserRole>>>;
};

export type WorkspaceLoaderResult =
  | { ok: true; ctx: WorkspaceLoaderContext }
  | { ok: false; response: ReturnType<typeof routeData<{ error: string }>> };

/**
 * Session auth + workspace membership for workspace UI loaders.
 */
export async function requireWorkspaceLoaderContext(
  request: Request,
  workspaceId: string | undefined,
): Promise<WorkspaceLoaderResult> {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  if (!workspaceId) {
    return {
      ok: false,
      response: routeData({ error: "Workspace ID is required" }, { headers, status: 400 }),
    };
  }

  const userRole = await getUserRole({ supabaseClient, user, workspaceId });
  if (!userRole) {
    return {
      ok: false,
      response: routeData(
        { error: "You don't have access to this workspace" },
        { headers, status: 403 },
      ),
    };
  }

  return {
    ok: true,
    ctx: { supabaseClient, headers, user, workspaceId, userRole },
  };
}
