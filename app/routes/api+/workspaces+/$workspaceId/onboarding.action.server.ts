import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { patchOnboardingBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getWorkspaceOnboardingDetail,
  patchWorkspaceOnboarding,
} from "@/lib/platform-onboarding.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

function requireWorkspaceUser({
  params,
  context,
}: Pick<LoaderFunctionArgs, "params" | "context">) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }
  return { workspaceId, userId };
}

export const loader = defineLoader({
  auth: requireWorkspaceUser,
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
  auth: requireWorkspaceUser,
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
