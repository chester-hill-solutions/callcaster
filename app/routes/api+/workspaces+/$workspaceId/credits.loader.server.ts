import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneSessionAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  // Membership-only by design (authClass "session", derived authoritatively
  // from dataPlaneSessionAuth). Every workspace role — `caller` included —
  // polls this from the campaign call screen for live credit reconciliation,
  // so no minRole gate: adding one would break dialing.
  auth: dataPlaneSessionAuth(),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const balance = await getWorkspaceCreditsBalance(auth.workspaceId);

    if (balance === null) {
      return jsonError("Workspace not found", 404);
    }

    return jsonResponse({ credits: balance }, 200);
  },
});
