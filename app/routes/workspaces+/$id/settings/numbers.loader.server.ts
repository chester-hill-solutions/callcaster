import { data as routeData, redirect } from "react-router";
import { getUserRole, getWorkspacePhoneNumbers, getWorkspaceUsers, removeWorkspacePhoneNumber, requireWorkspaceAccess, updateCallerId, updateWorkspacePhoneNumber } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { SupabaseClient } from "@supabase/supabase-js";
import { User, WorkspaceNumbers } from "@/lib/types";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { supabaseClient, headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return redirect("/signin");
  }
  const { data: users, error } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });
  const { data: phoneNumbers, error: numbersError } =
    await getWorkspacePhoneNumbers({ supabaseClient, workspaceId });
  const { data: workspace } = await supabaseClient
    .from("workspace")
    .select("credits")
    .eq("id", workspaceId)
    .single();
  const { data: mediaNames } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspaceId);
  const { data: queues } = await supabaseClient
    .from("inbound_queue")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .order("name");
  if (user) {
    const userRole = await getUserRole({
      supabaseClient,
      user: user as unknown as User,
      workspaceId,
    });
    const hasAccess = userRole?.role !== MemberRole.Caller;
    if (!hasAccess) return redirect("..");
    return routeData(
      {
        phoneNumbers,
        workspaceId,
        mediaNames,
        users,
        queues: queues || [],
        creditsBalance: workspace?.credits ?? 0,
      },
      { headers },
    );
  }

  return routeData(
    {
      phoneNumbers,
      workspaceId,
      user,
      users,
      queues: queues || [],
      creditsBalance: workspace?.credits ?? 0,
    },
    { headers },
  );
}
