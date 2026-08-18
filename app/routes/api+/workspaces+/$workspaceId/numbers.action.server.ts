import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { purchaseNumberBodySchema } from "@/lib/schemas/api/platform-workspace-admin";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneSessionMinRoleAuth } from "@/lib/capability-guard.server";
import { MemberRole } from "@/lib/member-role";
import { purchaseWorkspaceNumber } from "@/lib/platform-workspace-numbers.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  // Buying a number debits workspace credits, so the role floor belongs at the
  // route, not three layers down in `requireNumbersManager`. Member (not admin):
  // the purchase wizard at /workspaces/:id/settings/numbers/purchase is open to
  // members and `requireNumbersManager` has always allowed them — the declared
  // authClass was downgraded to match rather than tightening the live flow (D1).
  auth: dataPlaneSessionMinRoleAuth(MemberRole.Member),
  sideEffects: ["db-write", "twilio", "credit"],
  handler: async ({ request, auth }) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    const parsed = await parseJsonBodyOrResponse(request, purchaseNumberBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await purchaseWorkspaceNumber(
      auth.userId,
      auth.workspaceId,
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
  },
});
