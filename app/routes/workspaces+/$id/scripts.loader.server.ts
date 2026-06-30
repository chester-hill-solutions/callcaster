import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { listWorkspaceScriptsApi } from "@/lib/platform-data.server";
import { verifyAuth } from "@/lib/supabase.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import type { Json , Database } from "@/lib/database.types";
import type { LoaderFunctionArgs } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/lib/types";

type Script = {
  id: number;
  name: string;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  workspace: string | null;
  type: string | null;
  steps: Json;
};

type Workspace = {
  id: string;
  name: string;
};

type LoaderData =
  | {
      scripts: null;
      error: string;
      userRole: Database["public"]["Enums"]["workspace_role"] | null;
      workspace?: undefined;
    }
  | {
      scripts: Script[] | null;
      workspace: Workspace | null;
      error: null;
      userRole: Database["public"]["Enums"]["workspace_role"];
    };

export async function loader({ request, params }: LoaderFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params["id"];
  if (workspaceId == null) {
    return routeData<LoaderData>(
      {
        scripts: null,
        error: "Workspace does not exist",
        userRole: null,
      },
      { headers },
    );
  }

  const roleResult = await getUserRole({ supabaseClient: supabaseClient as SupabaseClient, user: user as User, workspaceId: workspaceId as string });
  const workspace = await getWorkspaceById(workspaceId);
  const scriptsResult = await listWorkspaceScriptsApi(supabaseClient, workspaceId);

  if (!scriptsResult.ok || !workspace) {
    const errorMessage = [
      !workspace ? "Workspace not found" : null,
      !scriptsResult.ok ? scriptsResult.error : null,
    ]
      .filter((message): message is string => message !== null)
      .join(", ");

    return routeData<LoaderData>(
      {
        scripts: null,
        error: errorMessage,
        userRole: (roleResult?.role as Database["public"]["Enums"]["workspace_role"]) ?? null,
      },
      { headers, status: !workspace ? 404 : scriptsResult.ok ? 200 : scriptsResult.status },
    );
  }

  return routeData<LoaderData>({
    scripts: scriptsResult.scripts as Script[],
    workspace: { id: workspace.id, name: workspace.name },
    error: null,
    userRole: (roleResult?.role as Database["public"]["Enums"]["workspace_role"]) ?? null,
  }, { headers });
}
