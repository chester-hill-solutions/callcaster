import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { patchOnboardingBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getWorkspaceOnboardingDetail,
  patchWorkspaceOnboarding,
} from "@/lib/platform-onboarding.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ params, context }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  const result = await getWorkspaceOnboardingDetail(userId, workspaceId);

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(result.detail, 200);
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  if (request.method !== "PATCH") {
    return jsonError("Method not allowed", 405);
  }

  const parsed = await parseJsonBodyOrResponse(request, patchOnboardingBodySchema);
  if (parsed instanceof Response) return parsed;

  const result = await patchWorkspaceOnboarding(
    userId,
    workspaceId,
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
}
