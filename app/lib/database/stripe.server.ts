/**
 * Stripe-related database functions
 */
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { user, workspace, workspace_users } from "@/db/schema";
import { env } from "../env.server";
import { logger } from "../logger.server";
import { adminDb } from "@/server/admin-db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

export async function createStripeContact({
  workspace_id,
  tdb: tdbIn,
}: {
  workspace_id: string;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspace_id);

  let workspaceRow: { name: string } | undefined;
  try {
    workspaceRow = await adminDb.query.workspace.findFirst({
      where: eq(workspace.id, workspace_id),
      columns: { name: true },
    });
  } catch (error) {
    logger.error("Error fetching workspace data:", error);
    throw error;
  }

  if (!workspaceRow) {
    throw new Error("No owner found for the workspace");
  }

  const ownerRecord = await tdb.workspace_users.findFirst({
    where: eq(workspace_users.role, "owner"),
    columns: { user_id: true },
  });

  if (!ownerRecord) {
    throw new Error("No owner found for the workspace");
  }

  const ownerUser = await adminDb.query.user.findFirst({
    where: eq(user.id, ownerRecord.user_id),
    columns: { id: true, username: true },
  });

  if (!ownerUser) {
    throw new Error("No owner user found");
  }

  const ownerEmail = ownerUser.username;
  if (!ownerEmail) {
    throw new Error("Owner user has no email or username");
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY(), {
    apiVersion: "2024-06-20",
  });

  return await stripe.customers.create({
    name: workspaceRow.name,
    email: ownerEmail,
  });
}

export async function meterEvent({
  workspace_id,
  amount,
  type,
}: {
  workspace_id: string;
  amount: number;
  type: string;
}) {
  const workspaceRow = await adminDb.query.workspace.findFirst({
    where: eq(workspace.id, workspace_id),
    columns: { stripe_id: true },
  });
  if (!workspaceRow?.stripe_id) return;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY());
  return await stripe.billing.meterEvents.create({
    event_name: type,
    payload: {
      value: String(amount),
      stripe_customer_id: workspaceRow.stripe_id,
    },
  });
}
