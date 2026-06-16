import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { User } from "@/lib/types";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return routeData(
      { workspace: null, error: "Workspace does not exist", userRole: null },
      { headers },
    );
  }

  const userRole = getUserRole({ supabaseClient, user: user as unknown as User, workspaceId });

  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();

  const { data: audienceData, error: audienceError } = await supabaseClient
    .from("audience")
    .select()
    .eq("workspace", workspaceId);

  if (workspaceError) {
    return routeData(
      { workspace: null, error: workspaceError.message, userRole },
      { headers },
    );
  }

  return routeData(
    { audienceData, workspace: workspaceData, error: null, userRole },
    { headers },
  );
}
