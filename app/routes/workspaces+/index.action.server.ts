import { createNewWorkspace } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { redirect } from "react-router";
import { verifyAuth } from "@/lib/auth.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {

  const { headers, user } = await verifyAuth(request);

  const formData = await request.formData();

  const newWorkspaceName = formData.get("newWorkspaceName") as string;
  const userId = formData.get("userId") as string;

  if (!newWorkspaceName || !userId) {
    return { error: "Workspace name or User Id missing!" };
  }

  const { data: newWorkspaceId, error, provisioningWarning } = await createNewWorkspace({
    workspaceName: newWorkspaceName,
    user_id: userId,
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
}
