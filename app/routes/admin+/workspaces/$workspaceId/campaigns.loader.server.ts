import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

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

    // Get workspace details with campaigns
    const { data: workspace } = await supabaseClient
        .from("workspace")
        .select("*, campaign(*)")
        .eq("id", workspaceId)
        .single();

    if (!workspace) {
        throw redirect("/admin?tab=workspaces");
    }

    return routeData({ 
        workspace
    });
}
