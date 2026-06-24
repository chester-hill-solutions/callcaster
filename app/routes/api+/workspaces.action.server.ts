import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { createWorkspaceBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { createWorkspaceForUser } from "@/lib/platform-auth.server";
import { withIdempotency } from "@/lib/platform-idempotency.server";
import { listUserWorkspaces } from "@/lib/platform-workspace.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const result = await listUserWorkspaces(
    getAuthSupabaseClient(auth),
    auth.user.id,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ workspaces: result.workspaces }, 200);
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const parsed = await parseJsonBodyOrResponse(request, createWorkspaceBodySchema);
  if (parsed instanceof Response) return parsed;

  return withIdempotency(request, "workspaces:create", async () => {
    const { data: workspaceId, error, provisioningWarning } =
      await createWorkspaceForUser(
        getAuthSupabaseClient(auth),
        auth.user.id,
        parsed.name,
      );

    if (error || !workspaceId) {
      return {
        response: jsonError(error ?? "Failed to create workspace", 500),
        body: { error: error ?? "Failed to create workspace" },
      };
    }

    const body = {
      id: workspaceId,
      name: parsed.name,
      provisioning_warning: provisioningWarning ?? null,
    };
    return { response: jsonResponse(body, 201), body };
  });
}
