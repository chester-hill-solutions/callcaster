import { randomUUID } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { workspace, workspace_number, workspace_number_purchase } from "@/db/schema";
import { db, type Database } from "@/server/db";
import { NUMBER_RENTAL_MONTHLY_CREDITS } from "@/lib/number-rental";
import { debitAmountFromCredits } from "@/lib/pricing";
import { numberRentalPurchaseKey } from "@/lib/billing-keys";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { invalidateWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { emitTransactionHistoryInsertEvent } from "@/lib/workspace-events.server";
import { logger } from "@/lib/logger.server";

export type NumberPurchase = typeof workspace_number_purchase.$inferSelect;
export type PurchaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const ACTIVE_STATES = ["reserved", "creating", "provisioned"] as const;
const LEASE_MS = 5 * 60_000;

function ownedPurchase(purchase: NumberPurchase) {
  return and(
    eq(workspace_number_purchase.id, purchase.id),
    eq(workspace_number_purchase.workspace, purchase.workspace),
    eq(workspace_number_purchase.lease_token, purchase.lease_token),
    inArray(workspace_number_purchase.state, [...ACTIVE_STATES]),
  );
}

export async function reserveNumberPurchase(args: {
  workspaceId: string;
  actorUserId: string;
  phoneNumber: string;
  accountSid: string;
}) {
  return db.transaction(async (tx) => {
    const [balance] = await tx.select({ credits: workspace.credits }).from(workspace)
      .where(eq(workspace.id, args.workspaceId)).for("update");
    if (!balance) throw new Error("Workspace not found");
    const existing = await tx.select({ id: workspace_number.id }).from(workspace_number)
      .where(and(eq(workspace_number.workspace, args.workspaceId), eq(workspace_number.phone_number, args.phoneNumber))).limit(1);
    const active = await tx.select().from(workspace_number_purchase).where(and(
      eq(workspace_number_purchase.workspace, args.workspaceId),
      inArray(workspace_number_purchase.state, [...ACTIVE_STATES]),
    ));
    if (existing.length || active.some((purchase) => purchase.phone_number === args.phoneNumber)) {
      return { ok: false as const, status: 409, error: "This number is already owned or its purchase needs recovery." };
    }
    const held = active.reduce((total, purchase) => total + purchase.credits, 0);
    if (balance.credits - held < NUMBER_RENTAL_MONTHLY_CREDITS) {
      return { ok: false as const, status: 402, error: "Insufficient credits for number rental", creditsError: true as const };
    }
    const [purchase] = await tx.insert(workspace_number_purchase).values({
      id: randomUUID(), workspace: args.workspaceId, actor_user_id: args.actorUserId,
      phone_number: args.phoneNumber, account_sid: args.accountSid,
      credits: NUMBER_RENTAL_MONTHLY_CREDITS, lease_token: randomUUID(),
      lease_expires_at: new Date(Date.now() + LEASE_MS),
    }).returning();
    if (!purchase) throw new Error("Number purchase reservation was not saved");
    return { ok: true as const, purchase };
  });
}

export async function startNumberPurchase(purchase: NumberPurchase) {
  const [row] = await db.update(workspace_number_purchase).set({ state: "creating", updated_at: new Date() })
    .where(and(ownedPurchase(purchase), eq(workspace_number_purchase.state, "reserved"))).returning();
  if (!row) throw new Error("Number purchase reservation is no longer owned");
}

export async function recordNumberPurchaseProvider(purchase: NumberPurchase, providerSid: string) {
  const [row] = await db.update(workspace_number_purchase).set({ state: "provisioned", provider_sid: providerSid, updated_at: new Date() })
    .where(ownedPurchase(purchase)).returning();
  if (!row) throw new Error("Number purchase reservation is no longer owned");
}

export async function finalizeNumberPurchase<T>(purchase: NumberPurchase, providerSid: string, note: string, write: (tx: PurchaseTransaction) => Promise<T>) {
  const { output, ledger } = await db.transaction(async (tx) => {
    const [balance] = await tx.select({ credits: workspace.credits }).from(workspace)
      .where(eq(workspace.id, purchase.workspace)).for("update");
    const [owned] = await tx.select().from(workspace_number_purchase).where(ownedPurchase(purchase)).for("update");
    if (!owned || owned.state !== "provisioned" || owned.provider_sid !== providerSid) {
      throw new Error("Number purchase reservation is no longer owned");
    }
    // Another billed operation can settle while provider creation is in flight.
    if (!balance || balance.credits < owned.credits) throw new Error("Insufficient credits for number rental");
    const output = await write(tx);
    const ledger = await insertTransactionHistoryIdempotent(tx, {
      workspaceId: purchase.workspace, type: "DEBIT",
      amount: debitAmountFromCredits(owned.credits), note,
      idempotencyKey: numberRentalPurchaseKey(purchase.workspace, providerSid),
      emitEvent: false,
    });
    await tx.update(workspace_number_purchase).set({ state: "completed", updated_at: new Date() }).where(ownedPurchase(purchase));
    const [after] = await tx.select({ credits: workspace.credits }).from(workspace).where(eq(workspace.id, purchase.workspace));
    if (!after || after.credits < 0) throw new Error("Number purchase violated the credit balance floor");
    return { output, ledger };
  });
  invalidateWorkspaceTwilioData(purchase.workspace);
  if (ledger.inserted && ledger.existingId) {
    try {
      await emitTransactionHistoryInsertEvent(purchase.workspace, {
        id: ledger.existingId, workspace: purchase.workspace, type: "DEBIT",
        amount: debitAmountFromCredits(purchase.credits),
        idempotency_key: numberRentalPurchaseKey(purchase.workspace, providerSid),
      });
    } catch (error) {
      logger.error("Number purchase ledger event failed", error);
    }
  }
  return output;
}

export async function cancelNumberPurchase(purchase: NumberPurchase) {
  await db.update(workspace_number_purchase).set({ state: "cancelled", updated_at: new Date(), last_error: null })
    .where(ownedPurchase(purchase));
}

export async function getCancellableNumberPurchase(purchase: NumberPurchase) {
  // Wait for an uncertain COMMIT before deciding to release the provider number.
  return db.transaction(async (tx) => {
    await tx.select({ id: workspace.id }).from(workspace)
      .where(eq(workspace.id, purchase.workspace)).for("update");
    const [row] = await tx.select().from(workspace_number_purchase)
      .where(ownedPurchase(purchase)).for("update");
    return row;
  });
}

export async function deferNumberPurchaseRecovery(purchase: NumberPurchase, message: string) {
  await db.update(workspace_number_purchase).set({ last_error: message, updated_at: new Date(), lease_expires_at: new Date() })
    .where(ownedPurchase(purchase));
}

export async function claimNumberPurchaseRecovery(limit = 25) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(workspace_number_purchase).where(and(
      inArray(workspace_number_purchase.state, [...ACTIVE_STATES]),
      lt(workspace_number_purchase.lease_expires_at, new Date()),
    )).orderBy(workspace_number_purchase.lease_expires_at).limit(limit).for("update", { skipLocked: true });
    if (!rows.length) return [];
    return tx.update(workspace_number_purchase).set({
      lease_token: randomUUID(), lease_expires_at: new Date(Date.now() + LEASE_MS),
    }).where(inArray(workspace_number_purchase.id, rows.map((row) => row.id))).returning();
  });
}

export function numberPurchaseProviderMarker(purchase: NumberPurchase) {
  return `[purchase:${purchase.id}]`;
}
