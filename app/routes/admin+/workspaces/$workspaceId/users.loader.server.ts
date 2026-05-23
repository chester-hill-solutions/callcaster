import { data as routeData, LoaderFunctionArgs, redirect, useLoaderData, Link } from "react-router";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

    const { supabaseClient, user } = await verifyAuth(request);

    if (!user) {
        throw redirect("/signin");
    }

    const { data: userData } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData || userData?.access_level !== 'sudo') {
        throw redirect("/signin");
    }

    const workspaceId = params.workspaceId;
    
    if (!workspaceId) {
        throw redirect("/admin?tab=workspaces");
    }

    // Get workspace users
    const { data: workspaceUsers } = await supabaseClient
        .from("workspace_users")
        .select("*, user:user_id(*)")
        .eq("workspace_id", workspaceId);

    return routeData({ 
        workspaceUsers: workspaceUsers || []
    });
}
