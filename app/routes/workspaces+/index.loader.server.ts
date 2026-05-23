import { ActionFunctionArgs, LoaderFunctionArgs, redirect, Form, Link, NavLink, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { FaPlus } from "react-icons/fa";
import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { createNewWorkspace } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

interface Workspace {
  id: string;
  name: string;
}

interface WorkspaceUser {
  last_accessed: string;
  role: string;
  workspace: Workspace;
}

interface LoaderData {
  workspaces: WorkspaceUser[] | null;
  userId: string;
  error: string | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {



  const { supabaseClient, headers, user } = await verifyAuth(request);

  if (!user) {
    return redirect("/signin", { headers });
  }

  const userId = user.id;
  if (!userId) {
    return redirect("/signin", { headers });
  }

  const { data: workspaces, error: workspacesError } = await supabaseClient
    .from("workspace_users")
    .select("last_accessed, role, workspace(id, name)")
    .eq("user_id", userId)
    .order("last_accessed", { ascending: false });

  if (workspacesError) {
    return { workspaces: null, userId: userId, error: workspacesError }
  }
  return { workspaces: workspaces, userId: userId, error: null };
}
