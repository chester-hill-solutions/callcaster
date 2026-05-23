import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect } from "react-router";
import { useLoaderData, Link, Outlet, NavLink, useSearchParams, useActionData, Form } from "react-router";
import { ChevronLeft, ChevronRight, MoreHorizontal, RefreshCw, Search } from "lucide-react";
import {
    filterWorkspaceAdminRows,
    sortWorkspaceAdminRows,
    type WorkspaceAdminRow,
    type WorkspaceSortKey,
} from "@/lib/admin-workspaces";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { deriveWorkspaceAdminRows } from "@/lib/admin-workspaces.server";
import { syncWorkspaceTwilioSnapshot } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {



    const { supabaseClient, user } = await verifyAuth(request)

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

    const { data: workspaces } = await supabaseClient
        .from("workspace")
        .select("*, campaign(*)")

    if (!workspaces) {
        throw redirect("/signin");
    }

    // Get all users
    const { data: users } = await supabaseClient
        .from("user")
        .select("*")
        .order("created_at", { ascending: false });

    // Get workspace users relationship
    const { data: workspaceUsers } = await supabaseClient
        .from("workspace_users")
        .select("*");

    const { data: workspaceNumbers } = await supabaseClient
        .from("workspace_number")
        .select("*");

    // Get all campaigns (not just recent ones)
    const { data: allCampaigns } = await supabaseClient
        .from("campaign")
        .select("*, workspace(*)")
        .order("created_at", { ascending: false });

    const workspaceRows = deriveWorkspaceAdminRows({
        workspaces: workspaces || [],
        users: users || [],
        workspaceUsers: workspaceUsers || [],
        workspaceNumbers: workspaceNumbers || [],
    });

    return routeData({ 
        user: userData, 
        workspaces, 
        users, 
        workspaceUsers,
        workspaceNumbers,
        workspaceRows,
        campaigns: allCampaigns || [],
        stats: {
            totalWorkspaces: workspaces?.length || 0,
            totalUsers: users?.length || 0,
            totalCampaigns: workspaces?.reduce((acc, workspace) => acc + (workspace.campaign?.length || 0), 0) || 0,
            activeWorkspaces: workspaces?.filter(w => !w.disabled).length || 0
        }
    });
}
