/**
 * Stripe-related database functions
 */
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { user, workspace, workspace_member } from "@/db/schema";
import { env } from "../env.server";
import { logger } from "../logger.server";
import { adminDb } from "@/server/admin-db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { STRIPE_CLIENT_OPTIONS } from "@/lib/stripe-client-options";

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
    },
    extras: {
      creation_expired: sql<boolean>`
        ${workspace.stripe_customer_creation_started_at} <= now() - interval '23 hours'
      `.as("creation_expired"),
    },
  });
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
  if (workspaceRow.stripe_id) return { id: workspaceRow.stripe_id };

  if (!workspaceRow.stripe_customer_creation) {
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
        name: workspaceRow.name,
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
    workspaceRow = await readCustomerWorkspace(workspace_id);
    if (!workspaceRow) throw new Error("Workspace no longer exists");
    if (workspaceRow.stripe_id) return { id: workspaceRow.stripe_id };
  }

  const params = customerCreationSchema.parse(workspaceRow.stripe_customer_creation);
  if (params.metadata.callcaster_workspace_id !== workspace_id) {
    throw new Error("Stripe customer creation belongs to another workspace");
  }
  const idempotencyKey = `workspace:${workspace_id}:stripe-customer`;
  if (idempotencyKey.length > 255) throw new Error("Workspace id is too long for Stripe billing");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY(), STRIPE_CLIENT_OPTIONS);
  let customer: Stripe.Customer;
  if (workspaceRow.creation_expired) {
    // A pruned provider key can create a second customer. Never repeat an old unknown create.
    const existing = await stripe.customers.search({
      query: `metadata['callcaster_request_id']:'${params.metadata.callcaster_request_id}'`,
      limit: 2,
    });
    const recovered = existing.data[0];
    if (existing.has_more || existing.data.length !== 1 || !recovered ||
        recovered.metadata.callcaster_workspace_id !== workspace_id ||
        recovered.metadata.callcaster_request_id !== params.metadata.callcaster_request_id) {
      logger.error("Stripe customer creation needs reconciliation", { workspaceId: workspace_id });
      throw new Error("Stripe customer creation needs reconciliation before retry");
    }
    customer = recovered;
  } else {
    customer = await stripe.customers.create(params, { idempotencyKey });
  }
  if (!customer.id) throw new Error("Stripe returned no customer identity");

  const [claimed] = await adminDb.update(workspace)
    .set({ stripe_id: customer.id })
    .where(and(eq(workspace.id, workspace_id), isNull(workspace.stripe_id)))
    .returning({ stripe_id: workspace.stripe_id });
  if (claimed) return customer;
  const canonical = await readCustomerWorkspace(workspace_id);
  if (canonical?.stripe_id === customer.id) return customer;
  logger.error("Stripe customer claim needs reconciliation", {
    workspaceId: workspace_id,
    unclaimedCustomerId: customer.id,
    canonicalCustomerId: canonical?.stripe_id ?? null,
  });
  throw new Error("Stripe customer claim needs reconciliation before checkout");
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
