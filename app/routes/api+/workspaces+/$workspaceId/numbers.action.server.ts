import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { purchaseNumberBodySchema } from "@/lib/schemas/api/platform-workspace-admin";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { purchaseWorkspaceNumber } from "@/lib/platform-workspace-numbers.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const parsed = await parseJsonBodyOrResponse(request, purchaseNumberBodySchema);
  if (parsed instanceof Response) return parsed;

  const result = await purchaseWorkspaceNumber(
    auth.user.id,
    workspaceId,
    parsed.phone_number,
  );

  if (!result.ok) {
    if ("creditsError" in result && result.creditsError) {
      return jsonResponse({ error: result.error, creditsError: true }, result.status);
    }
    return jsonError(result.error, result.status);
  }

  return jsonResponse(
    {
      number: result.number,
      messagingServiceAttached: result.messagingServiceAttached,
      messagingServiceAttachError: result.messagingServiceAttachError,
      partialSuccess: result.partialSuccess,
    },
    result.status,
  );
}
