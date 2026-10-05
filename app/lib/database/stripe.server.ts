/**
 * Stripe-related database functions
 */
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { user, workspace, workspace_member } from "@/db/schema";
import { env } from "../env.server";
import { logger } from "../logger.server";
import { adminDb } from "@/server/admin-db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { STRIPE_CLIENT_OPTIONS } from "@/lib/stripe-client-options";
import { reconcileStripeCustomerConflict } from "./stripe-customer-reconciliation.server";

const customerCreationSchema = z.object({
  name: z.string(),
  email: z.string().min(1),
  metadata: z.object({
    callcaster_workspace_id: z.string().min(1),
    callcaster_request_id: z.string().uuid(),
  }),
});

function readCustomerWorkspace(workspaceId: string) {
  return adminDb.query.workspace.findFirst({
    where: eq(workspace.id, workspaceId),
    columns: {
      name: true,
      stripe_id: true,
      stripe_customer_creation: true,
      stripe_customer_conflict: true,
      stripe_customer_creation_completed_id: true,
    },
    extras: {
      creation_expired: sql<boolean>`
        ${workspace.stripe_customer_creation_started_at} <= now() - interval '23 hours'
      `.as("creation_expired"),
    },
  });
}

async function freezeCustomerCreation(workspace_id: string, workspaceName: string, tdbIn?: TenantDb) {
  const tdb = tdbIn ?? createTenantDb(workspace_id);
  const ownerRecord = await tdb.workspace_member.findFirst({
    where: eq(workspace_member.role_id, "owner"),
    columns: { user_id: true },
  });
  if (!ownerRecord) throw new Error("No owner found for the workspace");
  const ownerUser = await adminDb.query.user.findFirst({
    where: eq(user.id, ownerRecord.user_id),
    columns: { id: true, username: true },
  });
  if (!ownerUser) throw new Error("No owner user found");
  if (!ownerUser.username) throw new Error("Owner user has no email or username");

  await adminDb.update(workspace).set({
    stripe_customer_creation: {
      name: workspaceName,
      email: ownerUser.username,
      metadata: {
        callcaster_workspace_id: workspace_id,
        callcaster_request_id: randomUUID(),
      },
    },
    stripe_customer_creation_started_at: sql`clock_timestamp()`,
  }).where(and(
    eq(workspace.id, workspace_id),
    isNull(workspace.stripe_id),
    isNull(workspace.stripe_customer_creation),
  ));
}

async function recoverCustomer(stripe: Stripe, params: z.infer<typeof customerCreationSchema>) {
  // A pruned provider key can create a second customer. Never repeat an old unknown create.
  const existing = await stripe.customers.search({
    query: `metadata['callcaster_request_id']:'${params.metadata.callcaster_request_id}'`,
    limit: 2,
  });
  const recovered = existing.data[0];
  if (existing.has_more || existing.data.length !== 1 || !recovered ||
      recovered.metadata.callcaster_workspace_id !== params.metadata.callcaster_workspace_id ||
      recovered.metadata.callcaster_request_id !== params.metadata.callcaster_request_id) {
    logger.error("Stripe customer creation needs reconciliation", { workspaceId: params.metadata.callcaster_workspace_id });
    throw new Error("Stripe customer creation needs reconciliation before retry");
  }
  return recovered;
}

async function claimCustomer(stripe: Stripe, workspaceId: string, customer: Stripe.Customer) {
  const [claimed] = await adminDb.update(workspace)
    .set({ stripe_id: customer.id, stripe_customer_creation_completed_id: customer.id })
    .where(and(eq(workspace.id, workspaceId), isNull(workspace.stripe_id)))
    .returning({ stripe_id: workspace.stripe_id });
  if (claimed) return customer;
  const canonical = await readCustomerWorkspace(workspaceId);
  if (canonical?.stripe_id === customer.id && !canonical.stripe_customer_conflict) {
    const [completed] = await adminDb.update(workspace).set({ stripe_customer_creation_completed_id: customer.id })
      .where(and(eq(workspace.id, workspaceId), eq(workspace.stripe_id, customer.id),
        isNull(workspace.stripe_customer_conflict)))
      .returning({ stripe_id: workspace.stripe_id });
    if (!completed) throw new Error("Stripe customer claim changed before completion");
    return customer;
  }
  logger.error("Stripe customer claim needs reconciliation", {
    workspaceId: workspaceId,
    unclaimedCustomerId: customer.id,
    canonicalCustomerId: canonical?.stripe_id ?? null,
  });
  if (!canonical?.stripe_id) throw new Error("Stripe customer claim has no canonical identity");
  await adminDb.update(workspace).set({
    stripe_customer_conflict: { unclaimed_id: customer.id, canonical_id: canonical.stripe_id },
  }).where(and(eq(workspace.id, workspaceId), ne(workspace.stripe_id, customer.id),
    isNull(workspace.stripe_customer_conflict)));
  return reconcileStripeCustomerConflict(stripe, workspaceId);
}

export async function createStripeContact({
  workspace_id,
  tdb: tdbIn,
}: {
  workspace_id: string;
  tdb?: TenantDb;
}) {
  let workspaceRow;
  try {
    workspaceRow = await readCustomerWorkspace(workspace_id);
  } catch (error) {
    logger.error("Error fetching workspace data:", error);
    throw error;
  }
  if (!workspaceRow) throw new Error("No owner found for the workspace");
  if (!workspaceRow.stripe_id && !workspaceRow.stripe_customer_creation) {
    await freezeCustomerCreation(workspace_id, workspaceRow.name, tdbIn);
    workspaceRow = await readCustomerWorkspace(workspace_id);
    if (!workspaceRow) throw new Error("Workspace no longer exists");
  }
  if (workspaceRow.stripe_customer_conflict) {
    return reconcileStripeCustomerConflict(new Stripe(env.STRIPE_SECRET_KEY(), STRIPE_CLIENT_OPTIONS), workspace_id);
  }
  if (workspaceRow.stripe_id && (!workspaceRow.stripe_customer_creation ||
      workspaceRow.stripe_customer_creation_completed_id === workspaceRow.stripe_id)) {
    return { id: workspaceRow.stripe_id };
  }

  const params = customerCreationSchema.parse(workspaceRow.stripe_customer_creation);
  if (params.metadata.callcaster_workspace_id !== workspace_id) {
    throw new Error("Stripe customer creation belongs to another workspace");
  }
  const idempotencyKey = `workspace:${workspace_id}:stripe-customer`;
  if (idempotencyKey.length > 255) throw new Error("Workspace id is too long for Stripe billing");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY(), STRIPE_CLIENT_OPTIONS);
  const customer = workspaceRow.creation_expired
    ? await recoverCustomer(stripe, params)
    : await stripe.customers.create(params, { idempotencyKey });
  if (!customer.id) throw new Error("Stripe returned no customer identity");

  return claimCustomer(stripe, workspace_id, customer);
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
  const stripe = new Stripe(env.STRIPE_SECRET_KEY(), STRIPE_CLIENT_OPTIONS);
  return await stripe.billing.meterEvents.create({
    event_name: type,
    payload: {
      value: String(amount),
      stripe_customer_id: workspaceRow.stripe_id,
    },
  });
}
