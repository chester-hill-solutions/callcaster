import { redirect } from "react-router";
import { getPurchaseReceiptUrl } from "@/lib/platform-billing.server";
import { jsonError } from "@/lib/platform-api.server";
import { dataPlaneSessionMinRoleAuth } from "@/lib/capability-guard.server";
import { MemberRole } from "@/lib/member-role";
import { defineLoader } from "@/lib/handler.server";

/**
 * `GET /api/workspaces/:workspaceId/billing/receipt?transaction=<ledger id>`
 * redirects to the Stripe-hosted receipt or invoice for one credit purchase.
 * Admin-only like the rest of billing; the lookup is workspace-scoped inside
 * getPurchaseReceiptUrl, so a foreign transaction id never resolves.
 */
export const loader = defineLoader({
  auth: dataPlaneSessionMinRoleAuth(MemberRole.Admin),
  sideEffects: ["db-read", "external"],
  handler: async ({ auth, url }) => {
    const transactionId = Number.parseInt(url.searchParams.get("transaction") ?? "", 10);
    if (!Number.isFinite(transactionId) || transactionId <= 0) {
      return jsonError("transaction is required", 400);
    }
    const result = await getPurchaseReceiptUrl({
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      transactionId,
    });
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return redirect(result.url, 302);
  },
});
