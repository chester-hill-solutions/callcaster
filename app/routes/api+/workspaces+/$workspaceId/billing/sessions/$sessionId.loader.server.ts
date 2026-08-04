import { pollBillingCheckoutSession } from "@/lib/platform-billing.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: ({ params, context }: LoaderFunctionArgs) => {
    const workspaceId = params.workspaceId;
    const sessionId = params.sessionId;

    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }

    if (!sessionId) {
      return jsonError("sessionId is required", 400);
    }

    const { userId } = getDataPlaneRouteContext(context, workspaceId);
    if (!userId) {
      return jsonError("Unauthorized", 401);
    }

    return { userId, workspaceId, sessionId };
  },
  sideEffects: ["external", "credit"],
  handler: async ({ auth }) => {
    const result = await pollBillingCheckoutSession({
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      sessionId: auth.sessionId,
    });

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      {
        status: result.status,
        payment_status: result.payment_status,
        confirmed: result.confirmed,
        credits_added: result.credits_added,
        ...(result.confirmed ? { inserted: result.inserted } : {}),
      },
      200,
    );
  },
});
