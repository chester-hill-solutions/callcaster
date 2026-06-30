import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import {
  deleteHandsetSessionApi,
  getHandsetSessionApi,
} from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  try {
    const result = await getHandsetSessionApi(      auth.user.id,
      workspaceId,
    );

    return jsonResponse(
      {
        handset_number: result.handset_number,
        listening: result.listening,
      },
      200,
    );
  } catch (error) {
    return createErrorResponse(error, "Failed to load handset session");
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "DELETE") {
    return jsonError("Method not allowed", 405);
  }

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  try {
    const result = await deleteHandsetSessionApi(      auth.user.id,
      workspaceId,
    );

    return jsonResponse({ success: result.success }, 200);
  } catch (error) {
    return createErrorResponse(error, "Failed to end handset session");
  }
}
