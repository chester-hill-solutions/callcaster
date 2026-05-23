import {
  data as routeData,
  redirect,
  type LoaderFunctionArgs,
} from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getUserRole, listMedia } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { Script, WorkspaceData } from "@/lib/types";
import type { MemberRole } from "@/components/workspace/TeamMember";

export type ScriptIdLoaderData = {
  workspace: WorkspaceData;
  workspace_id: string;
  selected_id: string;
  script: Script | null;
  mediaNames: Awaited<ReturnType<typeof listMedia>>;
  userRole: MemberRole;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, scriptId: selected_id } = params;
  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin");
  }
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
    userRole,
  } satisfies ScriptIdLoaderData);
};
