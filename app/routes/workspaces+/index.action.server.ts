import { ActionFunctionArgs, LoaderFunctionArgs, redirect, Form, Link, NavLink, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { FaPlus } from "react-icons/fa";
import { redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { createNewWorkspace } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {



  const { supabaseClient, headers, user } = await verifyAuth(request);

  const formData = await request.formData();

  const newWorkspaceName = formData.get("newWorkspaceName") as string;
  const userId = formData.get("userId") as string;

  if (!newWorkspaceName || !userId) {
    return { error: "Workspace name or User Id missing!" };
  }

  const { data: newWorkspaceId, error } = await createNewWorkspace({
    supabaseClient,
    workspaceName: newWorkspaceName,
    user_id: userId,
  });
  if (error) {
    logger.error("Error creating workspace:", error);
    return { error: "Failed to create Workspace" };
  }

  if (newWorkspaceId) {
    return redirect(`/workspaces/${newWorkspaceId}`, { headers });
  }

  return { ok: true, error: null };
}
