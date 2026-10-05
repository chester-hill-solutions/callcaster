import { pollBillingCheckoutSession } from "@/lib/platform-billing.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneSessionMinRoleAuth } from "@/lib/capability-guard.server";
import { MemberRole } from "@/lib/member-role";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneSessionMinRoleAuth(MemberRole.Admin),
  sideEffects: ["external", "credit"],
  handler: async ({ auth, params }) => {
    const sessionId = params.sessionId;
    if (!sessionId) {
      return jsonError("sessionId is required", 400);
    }

    const result = await pollBillingCheckoutSession({
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      sessionId,
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
