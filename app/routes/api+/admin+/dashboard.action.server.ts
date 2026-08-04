import { requireSudo } from "@/lib/api-auth.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  disableUser,
  syncAllWorkspacesTwilio,
  syncWorkspaceTwilio,
  toggleWorkspaceStatus,
} from "@/lib/platform-admin.server";
import { defineAction } from "@/lib/handler.server";
import { z } from "zod";

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

export const action = defineAction({
  auth: async ({ request }) => {
    const auth = await requireSudo(request);
    if (auth instanceof Response) return auth;

    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    return auth;
  },
  input: adminActionSchema,
  sideEffects: ["db-write", "twilio"],
  handler: async ({ input }) => {
    switch (input.action) {
      case "toggle_workspace_status": {
        const result = await toggleWorkspaceStatus(
          input.workspace_id,
          input.disabled,
        );
        if (!result.ok) return jsonError(result.error, 500);
        return jsonResponse({
          success: true,
          message: `Workspace ${input.disabled ? "disabled" : "enabled"} successfully`,
        });
      }
      case "sync_workspace_twilio": {
        const result = await syncWorkspaceTwilio(
          input.workspace_id,
        );
        if (!result.ok) return jsonError(result.error, 500);
        return jsonResponse({ success: true, message: "Workspace Twilio sync completed" });
      }
      case "sync_all_workspaces_twilio": {
        const result = await syncAllWorkspacesTwilio();
        if (!result.ok) return jsonError(result.error, 500);
        return jsonResponse({
          success: true,
          message: "Workspace Twilio sync started for all workspaces",
        });
      }
      case "toggle_user_status": {
        const result = await disableUser(input.user_id);
        if (!result.ok) return jsonError(result.error, 500);
        return jsonResponse({ success: true, message: "User disabled successfully" });
      }
      default: {
        const _exhaustive: never = input;
        return jsonError("Invalid action", 400);
      }
    }
  },
});
