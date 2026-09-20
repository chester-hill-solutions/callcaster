import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { patchOnboardingBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getWorkspaceOnboardingDetail,
  patchWorkspaceOnboarding,
} from "@/lib/platform-onboarding.server";
import { requireDataPlaneWorkspaceUser } from "@/lib/data-plane-route.server";
import { defineAction, defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: requireDataPlaneWorkspaceUser,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getWorkspaceOnboardingDetail(auth.userId, auth.workspaceId);

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(result.detail, 200);
  },
});

export const action = defineAction({
  auth: requireDataPlaneWorkspaceUser,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method !== "PATCH") {
      return jsonError("Method not allowed", 405);
    }

    const parsed = await parseJsonBodyOrResponse(request, patchOnboardingBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await patchWorkspaceOnboarding(
      auth.userId,
      auth.workspaceId,
      {
        current_step: parsed.current_step,
        selected_channels: parsed.selected_channels,
        status: parsed.status,
      },
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(result.detail, 200);
  },
});
