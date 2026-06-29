import { data as routeData } from "react-router";
import { formatDateToLocale } from "@/lib/utils";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { Json , Database } from "@/lib/database.types";
import type { LoaderFunctionArgs } from "react-router";
import type { PostgrestError , SupabaseClient } from "@supabase/supabase-js";
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

// ActionData inferred from action's return via typeof action

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

  const roleResult = await getUserRole({ supabaseClient: supabaseClient as SupabaseClient, user: user, workspaceId: workspaceId as string });
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();

  const { data: scripts, error: scriptsError } = await supabaseClient
    .from("script")
    .select()
    .eq("workspace", workspaceId);

  if (scriptsError || workspaceError) {
    const errorMessage = [scriptsError, workspaceError]
      .filter((e): e is PostgrestError => e !== null)
      .map((error) => error.message)
      .join(", ");

    return routeData<LoaderData>(
      {
        scripts: null,
        error: errorMessage,
        userRole: (roleResult?.role as Database["public"]["Enums"]["workspace_role"]) ?? null,
      },
      { headers },
    );
  }

  return routeData<LoaderData>({ scripts, workspace, error: null, userRole: (roleResult?.role as Database["public"]["Enums"]["workspace_role"]) ?? null }, { headers });
}
