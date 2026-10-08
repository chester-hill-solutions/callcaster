import { data as routeData } from "react-router";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { createTenantDb } from "@/server/tenant-db";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { defineAction } from "@/lib/handler.server";
import { manualCreditLoadKey } from "../../../../../shared/billing-keys";

/** Inclusive bounds for a single manual credit load. */
const MIN_CREDIT_LOAD = 1;
const MAX_CREDIT_LOAD = 100_000;

export const action = defineAction({
  auth: adminRouteAuth,
  sideEffects: ["db-write", "credit"],
  handler: async ({ request, params, auth }) => {
    const { userData } = auth;

    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return routeData({ error: "Workspace ID is required" }, { status: 400 });
    }

    const formData = await request.formData();

    const rawAmount = String(formData.get("amount") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    const nonce = String(formData.get("nonce") ?? "").trim();

    if (!/^\d+$/.test(rawAmount)) {
      return routeData(
        { error: "Amount must be a whole number between 1 and 100,000." },
        { status: 400 },
      );
    }
    const amount = Number(rawAmount);
    if (!Number.isInteger(amount) || amount < MIN_CREDIT_LOAD || amount > MAX_CREDIT_LOAD) {
      return routeData(
        { error: "Amount must be between 1 and 100,000 credits." },
        { status: 400 },
      );
    }

    if (!reason) {
      return routeData({ error: "A reason is required." }, { status: 400 });
    }
    if (!nonce) {
      return routeData({ error: "Form nonce is missing; reload the page and try again." }, { status: 400 });
    }

    const actor = userData.username ?? userData.id;
    const result = await insertTransactionHistoryIdempotent(createTenantDb(workspaceId), {
      workspaceId,
      type: "CREDIT",
      amount,
      note: `Manual credit load by ${actor}: ${reason}`,
      idempotencyKey: manualCreditLoadKey(workspaceId, nonce),
    });

    return routeData({
      success: result.inserted
        ? `${amount} credits loaded for ${workspaceId} (by ${actor})`
        : `No change: this form was already submitted (${amount} credits already applied)`,
    });
  },
});