import { requireSudo } from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  disableUser,
  syncAllWorkspacesTwilio,
  syncWorkspaceTwilio,
  toggleWorkspaceStatus,
} from "@/lib/platform-admin.server";
import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";

const adminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("toggle_workspace_status"),
    workspace_id: z.string().min(1),
    disabled: z.boolean(),
  }),
  z.object({
    action: z.literal("sync_workspace_twilio"),
    workspace_id: z.string().min(1),
  }),
  z.object({
    action: z.literal("sync_all_workspaces_twilio"),
  }),
  z.object({
    action: z.literal("toggle_user_status"),
    user_id: z.string().min(1),
  }),
]);

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireSudo(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const parsed = await parseJsonBodyOrResponse(request, adminActionSchema);
  if (parsed instanceof Response) return parsed;

  switch (parsed.action) {
    case "toggle_workspace_status": {
      const result = await toggleWorkspaceStatus(
        auth.supabaseClient,
        parsed.workspace_id,
        parsed.disabled,
      );
      if (!result.ok) return jsonError(result.error, 500);
      return jsonResponse({
        success: true,
        message: `Workspace ${parsed.disabled ? "disabled" : "enabled"} successfully`,
      });
    }
    case "sync_workspace_twilio": {
      const result = await syncWorkspaceTwilio(
        auth.supabaseClient,
        parsed.workspace_id,
      );
      if (!result.ok) return jsonError(result.error, 500);
      return jsonResponse({ success: true, message: "Workspace Twilio sync completed" });
    }
    case "sync_all_workspaces_twilio": {
      const result = await syncAllWorkspacesTwilio(auth.supabaseClient);
      if (!result.ok) return jsonError(result.error, 500);
      return jsonResponse({
        success: true,
        message: "Workspace Twilio sync started for all workspaces",
      });
    }
    case "toggle_user_status": {
      const result = await disableUser(auth.supabaseClient, parsed.user_id);
      if (!result.ok) return jsonError(result.error, 500);
      return jsonResponse({ success: true, message: "User disabled successfully" });
    }
    default: {
      const _exhaustive: never = parsed;
      return jsonError("Invalid action", 400);
    }
  }
}
