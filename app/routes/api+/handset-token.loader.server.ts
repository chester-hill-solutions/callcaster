import { data as routeData } from "react-router";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient: supabase, user } = await verifyAuth(request);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace") ?? "";
  const clientIdentity = url.searchParams.get("client_identity") ?? "";

  if (!workspace || !clientIdentity) {
    return routeData(
      { error: "workspace and client_identity are required" },
      { status: 400 },
    );
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user,
    workspaceId: workspace,
  });

  const result = await createHandsetAccessToken({
    supabaseClient: supabase,
    workspaceId: workspace,
    clientIdentity,
  });

  if (result.error) {
    const status = result.error === "Workspace not found" ? 404 : 400;
    return routeData({ error: result.error }, { status });
  }

  return routeData({ token: result.token });
};
