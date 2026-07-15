import { createNewWorkspace } from "@/lib/database/workspace.server";
import { logger } from "@/lib/logger.server";
import { data as routeData, redirect } from "react-router";
import { getSession } from "@/lib/auth.server";
import { defineAction } from "@/lib/handler.server";

const MAX_WORKSPACE_NAME_LENGTH = 200;

function resolveRequestId(request: Request): string {
  return (
    request.headers.get("x-request-id") ??
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `req-${Date.now()}`)
  );
}

export const action = defineAction({
  auth: async ({ request }) => {
    const { headers, user } = await getSession(request);
    if (!user) {
      throw redirect("/signin");
    }
    return { headers, user };
  },
  sideEffects: ["db-write", "twilio", "external"],
  handler: async ({ request, auth }) => {
    const { headers, user } = auth;
    const requestId = resolveRequestId(request);

    const formData = await request.formData();
    const rawName = formData.get("newWorkspaceName");
    const newWorkspaceName =
      typeof rawName === "string" ? rawName.trim() : "";

    if (!newWorkspaceName) {
      return routeData(
        { error: "Workspace name is required." },
        { status: 400, headers },
      );
    }

    if (newWorkspaceName.length > MAX_WORKSPACE_NAME_LENGTH) {
      return routeData(
        {
          error: `Workspace name must be ${MAX_WORKSPACE_NAME_LENGTH} characters or fewer.`,
        },
        { status: 400, headers },
      );
    }

    const { data: newWorkspaceId, error, provisioningWarning } =
      await createNewWorkspace({
        workspaceName: newWorkspaceName,
        user_id: user.id,
      });

    if (error || !newWorkspaceId) {
      logger.error("Error creating workspace", {
        requestId,
        userId: user.id,
        error,
      });
      return routeData(
        { error: "Failed to create workspace. Please try again." },
        { status: 500, headers },
      );
    }

    const redirectUrl = provisioningWarning
      ? `/workspaces/${newWorkspaceId}?provisioning=continues`
      : `/workspaces/${newWorkspaceId}`;
    return redirect(redirectUrl, { headers });
  },
});
