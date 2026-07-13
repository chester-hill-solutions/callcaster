import { createNewWorkspace } from "@/lib/database/workspace.server";
import { logger } from "@/lib/logger.server";
import { redirect } from "react-router";
import { getSession } from "@/lib/auth.server";
import { defineAction } from "@/lib/handler.server";

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

    const formData = await request.formData();

    const newWorkspaceName = formData.get("newWorkspaceName") as string;

    if (!newWorkspaceName) {
      return { error: "Workspace name missing!" };
    }

    const { data: newWorkspaceId, error, provisioningWarning } = await createNewWorkspace({
      workspaceName: newWorkspaceName,
      user_id: user.id,
    });
    if (error) {
      logger.error("Error creating workspace:", error);
      return { error: "Failed to create Workspace" };
    }

    if (newWorkspaceId) {
      const redirectUrl = provisioningWarning
        ? `/workspaces/${newWorkspaceId}?provisioning=continues`
        : `/workspaces/${newWorkspaceId}`;
      return redirect(redirectUrl, { headers });
    }

    return { ok: true, error: null };
  },
});
