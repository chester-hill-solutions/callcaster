import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import type { LoaderFunctionArgs } from "react-router";
import type { Database } from "@/lib/database.types";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  if (!user) return routeData({ error: "Unauthorized" }, { status: 401, headers });

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id") || params.id;
  if (!workspaceId) return routeData({ error: "workspace_id required" }, { status: 400, headers });

  const userRole = await getUserRole({
    supabaseClient,
    user,
    workspaceId,
  });
  if (!userRole) return routeData({ error: "Not a member" }, { status: 403, headers });

  // Load queues
  const { data: queues } = await supabaseClient
    .from("inbound_queue")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name");

  // Load queue members for each queue
  const queueIds = (queues || []).map((q) => q.id);
  let members: Database["public"]["Tables"]["inbound_queue_member"]["Row"][] = [];
  if (queueIds.length > 0) {
    const { data: memberData } = await supabaseClient
      .from("inbound_queue_member")
      .select("*")
      .in("queue_id", queueIds);
    members = memberData || [];
  }

  // Load workspace numbers
  const { data: numbers } = await supabaseClient
    .from("workspace_number")
    .select("id, phone_number, friendly_name, inbound_queue_id")
    .eq("workspace", workspaceId);

  return routeData(
    { queues, members, numbers },
    { headers },
  );
};
