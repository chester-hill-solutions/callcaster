import { listUserWorkspaces } from "@/lib/platform-workspace.server";
import { redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

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

  const userId = user.id;
  if (!userId) {
    return redirect("/signin", { headers });
  }

  const result = await listUserWorkspaces(supabaseClient, userId);

  if (!result.ok) {
    return { workspaces: null, userId: userId, error: result.error } satisfies LoaderData;
  }
  return {
    workspaces: result.workspaces as WorkspaceUser[],
    userId: userId,
    error: null,
  } satisfies LoaderData;
}
