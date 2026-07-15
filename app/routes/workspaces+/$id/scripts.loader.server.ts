import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database/workspace.server";
import { listWorkspaceScriptsApi } from "@/lib/platform-data.server";
import { getWorkspaceForClient } from "@/lib/workspace-members-db.server";
import { defineLoader } from "@/lib/handler.server";
import type { Json , Database } from "@/lib/db-types";
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

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const { headers, user, workspaceId } = auth;
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

    const roleResult = await getUserRole({user: user as User, workspaceId: workspaceId as string });
    const workspace = await getWorkspaceForClient(workspaceId);
    const scriptsResult = await listWorkspaceScriptsApi(workspaceId);

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
  },
});
