import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {

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

    const userId = params.userId;
    
    if (!userId) {
        return routeData({ error: "User ID is required" });
    }

    const formData = await request.formData();
    const action = formData.get("_action") as string;

    if (action === "add_to_workspace") {
        const workspaceId = formData.get("workspaceId") as string;
        const role = formData.get("role") as string;

        if (!workspaceId) {
            return routeData({ error: "Workspace is required" });
        }

        if (!role) {
            return routeData({ error: "Role is required" });
        }

        // Check if user is already in the workspace
        const { data: existingMembership } = await supabaseClient
            .from("workspace_users")
            .select("*")
            .eq("user_id", userId)
            .eq("workspace_id", workspaceId)
            .single();

        if (existingMembership) {
            return routeData({ error: "User is already a member of this workspace" });
        }

        // Add user to workspace
        const { error } = await supabaseClient
            .from("workspace_users")
            .insert({
                user_id: userId,
                workspace_id: workspaceId,
                role: role as "owner" | "member" | "caller" | "admin" | undefined
            });

        if (error) {
            return routeData({ error: error.message });
        }

        return routeData({ success: "User added to workspace successfully" });
    }

    if (action === "update_role") {
        const workspaceId = formData.get("workspaceId") as string;
        const role = formData.get("role") as "owner" | "member" | "caller" | "admin" | undefined;

        if (!workspaceId || !role) {
            return routeData({ error: "Workspace and role are required" });
        }

        const { error } = await supabaseClient
            .from("workspace_users")
            .update({ role: role as "owner" | "member" | "caller" | "admin" | undefined })
            .eq("user_id", userId)
            .eq("workspace_id", workspaceId);

        if (error) {
            return routeData({ error: error.message });
        }

        return routeData({ success: "User role updated successfully" });
    }

    if (action === "remove_from_workspace") {
        const workspaceId = formData.get("workspaceId") as string;

        if (!workspaceId) {
            return routeData({ error: "Workspace ID is required" });
        }

        const { error } = await supabaseClient
            .from("workspace_users")
            .delete()
            .eq("user_id", userId)
            .eq("workspace_id", workspaceId);

        if (error) {
            return routeData({ error: error.message });
        }

        return routeData({ success: "User removed from workspace successfully" });
    }

    if (action === "cancel_invite") {
        const inviteId = formData.get("inviteId") as string;

        if (!inviteId) {
            return routeData({ error: "Invite ID is required" });
        }

        const { error } = await supabaseClient
            .from("workspace_invite")
            .delete()
            .eq("id", inviteId);

        if (error) {
            return routeData({ error: error.message });
        }

        return routeData({ success: "Invitation cancelled successfully" });
    }

    return routeData({ error: "Invalid action" });
}
