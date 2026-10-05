import type Stripe from "stripe";
import type { workspace } from "@/db/schema";

type ConflictState = Pick<typeof workspace.$inferSelect, "stripe_id" | "stripe_customer_creation" |
  "stripe_customer_conflict" | "stripe_customer_creation_completed_id">;

type ConflictAccess = {
  read: () => Promise<ConflictState | undefined>;
  complete: (conflict: NonNullable<ConflictState["stripe_customer_conflict"]>) => Promise<string | undefined>;
};

async function readConflict(access: ConflictAccess) {
  const row = await access.read();
  const conflict = row?.stripe_customer_conflict;
  if (!conflict || conflict.canonical_id !== row.stripe_id ||
      conflict.unclaimed_id === row.stripe_id ||
      row.stripe_customer_creation_completed_id === conflict.unclaimed_id) {
    throw new Error("Stripe customer conflict needs operator reconciliation");
  }
  return { row, conflict };
}

export async function reconcileStripeCustomerConflict(stripe: Stripe, workspaceId: string, access: ConflictAccess) {
  const { row, conflict } = await readConflict(access);
  const customer = await stripe.customers.retrieve(conflict.unclaimed_id);
  if (customer.id !== conflict.unclaimed_id) throw new Error("Stripe returned a different customer identity");
  if (!customer.deleted) {
    const metadata = row.stripe_customer_creation?.metadata;
    if (!metadata || customer.metadata.callcaster_workspace_id !== workspaceId ||
        customer.metadata.callcaster_request_id !== metadata.callcaster_request_id ||
        customer.balance !== 0 || customer.default_source || customer.invoice_settings.default_payment_method) {
      throw new Error("Unclaimed Stripe customer cannot be safely removed");
    }
    const history = await Promise.all([
      stripe.checkout.sessions.list({ customer: customer.id, limit: 1 }),
      stripe.paymentMethods.list({ customer: customer.id, limit: 1 }),
      stripe.invoices.list({ customer: customer.id, limit: 1 }),
      stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 1 }),
      stripe.charges.list({ customer: customer.id, limit: 1 }),
      stripe.paymentIntents.list({ customer: customer.id, limit: 1 }),
      stripe.customers.listSources(customer.id, { limit: 1 }),
    ]);
    if (history.some(list => list.data.length > 0 || list.has_more)) {
      throw new Error("Unclaimed Stripe customer has payment or billing history");
    }
    // New checkout paths stop at the durable conflict. Recheck ownership after provider reads.
    const current = await readConflict(access);
    if (current.conflict.unclaimed_id !== conflict.unclaimed_id ||
        current.conflict.canonical_id !== conflict.canonical_id) {
      throw new Error("Stripe customer conflict changed during reconciliation");
    }
    const deleted = await stripe.customers.del(customer.id);
    if (!deleted.deleted) throw new Error("Stripe did not confirm customer removal");
  }
  const clearedId = await access.complete(conflict);
  if (!clearedId) throw new Error("Stripe customer conflict changed before completion");
  return { id: clearedId };
}
