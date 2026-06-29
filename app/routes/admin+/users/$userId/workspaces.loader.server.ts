import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

    const { supabaseClient, user } = await verifyAuth(request);

    const { data: userData } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData || userData?.access_level !== 'sudo') {
        throw redirect("/signin");
    }

    const userId = params.userId;
    
    if (!userId) {
        throw redirect("/admin?tab=users");
    }

    // Get the user
    const { data: targetUser } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", userId)
        .single();

    if (!targetUser) {
        throw redirect("/admin?tab=users");
    }

    // Get all workspaces
    const { data: allWorkspaces } = await supabaseClient
        .from("workspace")
        .select("*")
        .order("name");

    // Get user's workspaces
    const { data: userWorkspaces } = await supabaseClient
        .from("workspace_users")
        .select("*, workspace(*)")
        .eq("user_id", userId);

    // Get pending invites
    const { data: pendingInvites } = await supabaseClient
        .from("workspace_invite")
        .select("*, workspace(*)")
        .eq("email", targetUser.username)
        .eq("status", "pending");

    return routeData({ 
        currentUser: userData,
        targetUser,
        allWorkspaces: allWorkspaces || [],
        userWorkspaces: userWorkspaces || [],
        pendingInvites: pendingInvites || []
    });
}
