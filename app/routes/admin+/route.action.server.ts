import { data as routeData } from "react-router";
import {
  disableUser,
  repointAllWorkspacesTwilioWebhooks,
  repointWorkspaceTwilioWebhooksForAdmin,
  syncAllWorkspacesTwilio,
  syncWorkspaceTwilio,
  toggleWorkspaceStatus,
} from "@/lib/platform-admin.server";
import { getAdminRouteContext } from "@/lib/admin-route.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  getAdminRouteContext(context);
  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  if (actionType === "toggle_workspace_status") {
    const workspaceId = formData.get("workspaceId") as string;
    const currentStatus = formData.get("currentStatus") === "true";
    const result = await toggleWorkspaceStatus(workspaceId, !currentStatus);

    if (!result.ok) {
      return routeData({ error: result.error });
    }

    return routeData({
      success: `Workspace ${currentStatus ? "enabled" : "disabled"} successfully`,
    });
  }

  if (actionType === "sync_workspace_twilio") {
    const workspaceId = formData.get("workspaceId") as string;
    const result = await syncWorkspaceTwilio(workspaceId);

    if (!result.ok) {
      return routeData({ error: result.error });
    }

    return routeData({ success: "Workspace Twilio sync completed" });
  }

  if (actionType === "sync_all_workspaces_twilio") {
    const result = await syncAllWorkspacesTwilio();

    if (!result.ok) {
      return routeData({ error: result.error });
    }

    return routeData({ success: "Workspace Twilio sync started for all workspaces" });
  }

  if (actionType === "repoint_twilio_webhooks") {
    const workspaceId = formData.get("workspaceId") as string | null;
    const result = workspaceId
      ? await repointWorkspaceTwilioWebhooksForAdmin(workspaceId)
      : await repointAllWorkspacesTwilioWebhooks();

    if (!result.ok) {
      return routeData({ error: result.error });
    }

    if ("result" in result) {
      return routeData({
        success: `Repointed ${result.result.updated} Twilio resources (${result.result.skipped} unchanged)`,
      });
    }

    const totalUpdated = result.results.reduce(
      (sum: number, row: { updated: number }) => sum + row.updated,
      0,
    );
    return routeData({
      success: `Repointed ${totalUpdated} Twilio resources across ${result.results.length} workspaces`,
    });
  }

  if (actionType === "toggle_user_status") {
    const userId = formData.get("userId") as string;
    const result = await disableUser(userId);

    if (!result.ok) {
      return routeData({ error: result.error });
    }

    return routeData({ success: "User disabled successfully" });
  }

  return routeData({ error: "Invalid action" });
};
