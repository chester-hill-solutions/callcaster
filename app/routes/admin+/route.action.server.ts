import {
    filterWorkspaceAdminRows,
    sortWorkspaceAdminRows,
    type WorkspaceAdminRow,
    type WorkspaceSortKey,
} from "@/lib/admin-workspaces";
import { data as routeData, redirect } from "react-router";
import { deriveWorkspaceAdminRows } from "@/lib/admin-workspaces.server";
import { syncWorkspaceTwilioSnapshot } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {

    const { supabaseClient, user } = await verifyAuth(request);

    const { data: userData } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData || userData?.access_level !== 'sudo') {
        throw redirect("/signin");
    }

    const formData = await request.formData();
    const action = formData.get("_action") as string;

    if (action === "toggle_workspace_status") {
        const workspaceId = formData.get("workspaceId") as string;
        const currentStatus = formData.get("currentStatus") === "true";
        
        const { error } = await supabaseClient
            .from("workspace")
            .update({ disabled: !currentStatus })
            .eq("id", workspaceId);

        if (error) {
            return routeData({ error: error.message });
        }

        return routeData({ success: `Workspace ${currentStatus ? 'enabled' : 'disabled'} successfully` });
    }

    if (action === "sync_workspace_twilio") {
        const workspaceId = formData.get("workspaceId") as string;
        try {
            await syncWorkspaceTwilioSnapshot({
                supabaseClient,
                workspaceId,
            });
            return routeData({ success: "Workspace Twilio sync completed" });
        } catch (error) {
            return routeData({
                error: error instanceof Error ? error.message : "Failed to sync workspace Twilio data",
            });
        }
    }

    if (action === "sync_all_workspaces_twilio") {
        const { error } = await supabaseClient.functions.invoke("workspace-twilio-sync", {
            body: {},
        });

        if (error) {
            return routeData({ error: error.message });
        }

        return routeData({ success: "Workspace Twilio sync started for all workspaces" });
    }
    
    if (action === "toggle_user_status") {
        const userId = formData.get("userId") as string;
        
        // For now, we'll just disable users by setting access_level to 'disabled'
        // This assumes the system will check for this value elsewhere
        const { error } = await supabaseClient
            .from("user")
            .update({ access_level: 'disabled' })
            .eq("id", userId);

        if (error) {
            return routeData({ error: error.message });
        }

        return routeData({ success: `User disabled successfully` });
    }

    return routeData({ error: "Invalid action" });
}
