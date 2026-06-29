import { data as routeData, redirect } from "react-router";
import { getUserRole, listMedia } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";
import type { Script } from "@/lib/types";
import type { Tables } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ScriptIdLoaderData = {
  workspace: Tables<"workspace">;
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
  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspace_id as string)
    .single();
  if (workspaceError) throw workspaceError;
  const userRole = await getUserRole({
    supabaseClient: supabaseClient as SupabaseClient,
    user,
    workspaceId: workspace_id as string,
  });
  const { data: script } = await supabaseClient
    .from("script")
    .select()
    .eq("workspace", workspace_id as string)
    .eq("id", Number(selected_id) || 0)
    .single();

  const mediaNames = await listMedia(supabaseClient, workspace_id as string);
  return routeData({
    workspace: workspaceData,
    workspace_id,
    selected_id,
    script,
    mediaNames,
    userRole: (userRole?.role ?? MemberRole.Member) as MemberRole,
  } satisfies ScriptIdLoaderData);
};
