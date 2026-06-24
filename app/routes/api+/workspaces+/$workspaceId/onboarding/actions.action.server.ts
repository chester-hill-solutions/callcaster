import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { onboardingActionBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { runOnboardingAction } from "@/lib/platform-onboarding.server";
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
  const result = await runOnboardingAction(
    getAuthSupabaseClient(auth),
    auth.user.id,
    workspaceId,
    actionName,
    input,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  const { result: handlerResult, detail } = result;

  if (handlerResult.kind === "redirect") {
    return jsonResponse(
      {
        ...detail,
        redirect: {
          step: handlerResult.step,
          search_params: handlerResult.searchParams ?? null,
        },
      },
      200,
    );
  }

  const status = handlerResult.status ?? 200;
  const body = {
    ...detail,
    ...handlerResult.data,
  };

  if (handlerResult.data.error) {
    return jsonResponse(body, status >= 400 ? status : 400);
  }

  return jsonResponse(body, status);
}
