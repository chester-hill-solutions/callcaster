import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return redirect("/signin");
  }

  const userRole = await getUserRole({ supabaseClient, user, workspaceId });
  if (!userRole || userRole.role === MemberRole.Caller) {
    return redirect("..");
  }

  const { data: queues } = await supabaseClient
    .from("inbound_queue")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name");

  const queueIds = (queues || []).map((q) => q.id);
  let members: { id: number; queue_id: number; user_id: string; workspace_id: string }[] = [];
  if (queueIds.length > 0) {
    const { data: memberData } = await supabaseClient
      .from("inbound_queue_member")
      .select("*")
      .in("queue_id", queueIds);
    members = (memberData || []) as typeof members;
  }

  const { data: numbers } = await supabaseClient
    .from("workspace_number")
    .select("id, phone_number, friendly_name, inbound_queue_id")
    .eq("workspace", workspaceId);

  return routeData(
    {
      queues: queues || [],
      members,
      numbers: numbers || [],
      workspaceId,
    },
    { headers },
  );
};
