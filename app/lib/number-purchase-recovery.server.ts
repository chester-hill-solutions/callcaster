import type Twilio from "twilio";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { logger } from "@/lib/logger.server";
import { isObject } from "@/lib/type-safety-utils";
import {
  getCancellableNumberPurchase, cancelNumberPurchase, claimNumberPurchaseRecovery,
  deferNumberPurchaseRecovery, numberPurchaseProviderMarker, type NumberPurchase,
} from "@/lib/number-purchase-reservation.server";

export function isDefiniteNumberPurchaseRejection(error: unknown) {
  return isObject(error) && typeof error.status === "number" &&
    error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

export async function compensateNumberPurchase(purchase: NumberPurchase, twilio: Twilio.Twilio, providerSid?: string) {
  const current = await getCancellableNumberPurchase(purchase);
  if (!current) return false;
  purchase = current;
  if (twilio.accountSid !== purchase.account_sid) throw new Error("Number purchase account changed; recovery needs the original account");
  let sid = providerSid ?? purchase.provider_sid;
  if (!sid && purchase.state !== "reserved") {
    const rows = await withTwilioRetry(() => twilio.incomingPhoneNumbers.list({ phoneNumber: purchase.phone_number, limit: 100 }), {
      workspaceId: purchase.workspace, operation: "numberPurchase.recovery.lookup",
    });
    const owned = rows.filter((row) => row.accountSid === purchase.account_sid && row.phoneNumber === purchase.phone_number &&
      row.friendlyName.includes(numberPurchaseProviderMarker(purchase)));
    if (owned.length !== 1 || !owned[0]) return false;
    sid = owned[0].sid;
  }
  if (sid) {
    try {
      const removed = await withTwilioRetry(() => twilio.incomingPhoneNumbers(sid).remove(), {
        workspaceId: purchase.workspace, operation: "numberPurchase.recovery.release",
      });
      if (!removed) throw new Error("Provider number release was not confirmed");
    } catch (error) {
      // The SDK addresses the recorded SID on the verified original account.
      if (!isObject(error) || error.status !== 404 || error.code !== 20404) throw error;
    }
  }
  await cancelNumberPurchase(purchase);
  return true;
}

export async function runNumberPurchaseRecovery() {
  const rows = await claimNumberPurchaseRecovery();
  let cancelled = 0;
  for (const purchase of rows) {
    try {
      if (purchase.state === "reserved") {
        await cancelNumberPurchase(purchase);
        cancelled++;
        continue;
      }
      const twilio = await createWorkspaceTwilioInstance({ workspace_id: purchase.workspace });
      if (await compensateNumberPurchase(purchase, twilio)) cancelled++;
      else logger.warn("number_purchase.recovery.unknown", { workspaceId: purchase.workspace, purchaseId: purchase.id });
    } catch (error) {
      logger.error("number_purchase.recovery.failed", { workspaceId: purchase.workspace, purchaseId: purchase.id, error });
    }
  }
  return { examined: rows.length, cancelled, pending: rows.length - cancelled };
}

export async function retainNumberPurchaseForRecovery(purchase: NumberPurchase) {
  try {
    await deferNumberPurchaseRecovery(purchase, "Number purchase needs provider verification or release.");
  } catch (error) {
    // The original committed reservation remains available after the lease expires.
    logger.error("number_purchase.recovery.defer_failed", { workspaceId: purchase.workspace, purchaseId: purchase.id, error });
  }
}
