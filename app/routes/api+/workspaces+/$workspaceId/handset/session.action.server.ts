import { createErrorResponse } from "@/lib/errors.server";
import {
  deleteHandsetSessionApi,
  getHandsetSessionApi,
} from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
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

  try {
    const result = await getHandsetSessionApi(userId, workspaceId);

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

export async function action({ request, params, context }: ActionFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  if (request.method !== "DELETE") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const result = await deleteHandsetSessionApi(userId, workspaceId);

    return jsonResponse({ success: result.success }, 200);
  } catch (error) {
    return createErrorResponse(error, "Failed to end handset session");
  }
}
