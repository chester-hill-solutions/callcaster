import { data as routeData, redirect } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";
import type { User } from "@/lib/types";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { supabaseClient, headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return redirect("/signin");
  }

  const userRole = await getUserRole({
    supabaseClient,
    user: user as unknown as User,
    workspaceId,
  });
  if (userRole?.role === MemberRole.Caller) {
    return redirect("..");
  }

  const { data: workspace, error } = await supabaseClient
    .from("workspace")
    .select("credits")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw new Response(error.message, { status: 500, headers });
  }

  return routeData(
    {
      workspaceId,
      creditsBalance: workspace?.credits ?? 0,
    },
    { headers },
  );
}
