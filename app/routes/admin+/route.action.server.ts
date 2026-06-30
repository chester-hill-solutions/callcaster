import { data as routeData } from "react-router";
import {
  disableUser,
  syncAllWorkspacesTwilio,
  syncWorkspaceTwilio,
  toggleWorkspaceStatus,
} from "@/lib/platform-admin.server";
import { requireSudoAdmin } from "./requireSudoAdmin.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireSudoAdmin(request);
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
