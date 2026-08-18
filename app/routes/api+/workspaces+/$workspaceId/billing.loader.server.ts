import { getWorkspaceBilling } from "@/lib/platform-billing.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneSessionMinRoleAuth } from "@/lib/capability-guard.server";
import { MemberRole } from "@/lib/member-role";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  // Declared `authClass: "workspaceAdmin"`; enforce it here rather than relying
  // on `getWorkspaceBilling`, which only proves membership. This endpoint returns
  // the workspace balance plus the full transaction history.
  auth: dataPlaneSessionMinRoleAuth(MemberRole.Admin),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getWorkspaceBilling(
      auth.userId,
      auth.workspaceId,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      {
        balance: result.balance,
        transactions: result.transactions,
        pricing: result.pricing,
      },
      200,
    );
  },
});
