import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import {
  startCallListeningApi,
  stopCallListeningApi,
} from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  try {
    if (request.method === "POST") {
      const result = await startCallListeningApi(
        client,
        auth.user,
        workspaceId,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse(
        {
          listening: result.listening,
          token: result.token,
          token_error: result.token_error,
          handset_number: result.handset_number,
          client_identity: result.client_identity,
        },
        200,
      );
    }

    if (request.method === "DELETE") {
      const result = await stopCallListeningApi(
        client,
        auth.user.id,
        workspaceId,
      );

      return jsonResponse({ listening: result.listening }, 200);
    }

    return jsonError("Method not allowed", 405);
  } catch (error) {
    return createErrorResponse(error, "Failed to update listening state");
  }
}
