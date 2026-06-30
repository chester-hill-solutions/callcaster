import { data as routeData, redirect } from "react-router";
import { getUserRole, listMedia } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { getScriptDetailApi } from "@/lib/platform-data.server";
import { verifyAuth } from "@/lib/supabase.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import type { LoaderFunctionArgs } from "react-router";
import type { Script } from "@/lib/types";

export type ScriptIdLoaderData = {
  workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceById>>>;
  workspace_id: string;
  selected_id: string;
  script: Script | null;
  mediaNames: Awaited<ReturnType<typeof listMedia>>;
  userRole: MemberRole;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, scriptId: selected_id } = params;
  if (!workspace_id || !selected_id) {
    throw redirect("/workspaces");
  }

  const { supabaseClient, user } = await verifyAuth(request);

  const workspaceData = await getWorkspaceById(workspace_id);
  if (!workspaceData) {
    throw redirect("/workspaces");
  }

  const userRole = await getUserRole({
    user,
    workspaceId: workspace_id,
  });
  if (!userRole?.role) {
    throw redirect(`/workspaces/${workspace_id}`);
  }

  const scriptResult = await getScriptDetailApi(
    supabaseClient,
    selected_id,
    workspace_id,
  );
  const script = scriptResult.ok ? (scriptResult.script as Script) : null;

  const mediaNames = await listMedia(supabaseClient, workspace_id);
  return routeData({
    workspace: workspaceData,
    workspace_id,
    selected_id,
    script,
    mediaNames,
    userRole: userRole.role as MemberRole,
  } satisfies ScriptIdLoaderData);
};
