import { requireJsonAuth } from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { onboardingActionBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  mapOnboardingHandlerResult,
  runOnboardingAction,
} from "@/lib/platform-onboarding.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const parsed = await parseJsonBodyOrResponse(request, onboardingActionBodySchema);
  if (parsed instanceof Response) return parsed;

  const { action: actionName, ...input } = parsed;
  const result = await runOnboardingAction(    auth.user.id,
    workspaceId,
    actionName,
    input,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  const mapped = mapOnboardingHandlerResult(result.result, result.detail, "api");
  if (mapped.kind !== "api_json") {
    return jsonError("Unexpected onboarding redirect for API client", 500);
  }
  return jsonResponse(mapped.body, mapped.status);
}
