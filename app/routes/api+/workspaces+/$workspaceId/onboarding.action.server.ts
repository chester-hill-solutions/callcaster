import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { patchOnboardingBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getWorkspaceOnboardingDetail,
  patchWorkspaceOnboarding,
} from "@/lib/platform-onboarding.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const result = await getWorkspaceOnboardingDetail(
    getAuthSupabaseClient(auth),
    auth.user.id,
    workspaceId,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(result.detail, 200);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "PATCH") {
    return jsonError("Method not allowed", 405);
  }

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const parsed = await parseJsonBodyOrResponse(request, patchOnboardingBodySchema);
  if (parsed instanceof Response) return parsed;

  const result = await patchWorkspaceOnboarding(
    getAuthSupabaseClient(auth),
    auth.user.id,
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
