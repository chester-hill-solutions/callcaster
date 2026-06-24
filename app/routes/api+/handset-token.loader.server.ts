import { data as routeData } from "react-router";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";
import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { createErrorResponse } from "@/lib/errors.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace") ?? "";
  const clientIdentity = url.searchParams.get("client_identity") ?? "";

  if (!workspace || !clientIdentity) {
    return routeData(
      { error: "workspace and client_identity are required" },
      { status: 400 },
    );
  }

  try {
    const supabase = getAuthSupabaseClient(auth);
    await requireWorkspaceAccess({ supabaseClient: supabase,
      user: auth.user,
      workspaceId: workspace,
    });

    const result = await createHandsetAccessToken({ supabaseClient: supabase,
      workspaceId: workspace,
      clientIdentity,
    });

    if (result.error) {
      const status = result.error === "Workspace not found" ? 404 : 400;
      return routeData({ error: result.error }, { status });
    }

    return routeData({ token: result.token });
  } catch (error) {
    return createErrorResponse(error, "Failed to generate handset token");
  }
};
