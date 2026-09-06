import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { transaction_history as transactionHistoryTable, workspace as workspaceTable } from "@/db/schema";
import { createStripeContact } from "@/lib/database/stripe.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import type { Database } from "@/lib/db-types";
import {
  CREDIT_PRICE_CAD,
  MIN_CREDITS,
  MIN_PURCHASE_CAD,
  formatCredits,
  formatCurrency,
} from "@/lib/billing-format";
import { billingPricingSchema } from "@/lib/schemas/api/platform-billing";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { stripeSessionKey } from "@/lib/billing-keys";
import { adminDb } from "@/server/admin-db";
import { createTenantDb } from "@/server/tenant-db";
import { db } from "@/server/db";
import { STRIPE_CLIENT_OPTIONS } from "@/lib/stripe-client-options";

export const billingPricing = billingPricingSchema.parse({
  credit_price_cad: CREDIT_PRICE_CAD,
  min_credits: MIN_CREDITS,
  min_purchase_cad: MIN_PURCHASE_CAD,
});

function createStripeClient() {
  return new Stripe(env.STRIPE_SECRET_KEY(), STRIPE_CLIENT_OPTIONS);
}

async function ensureStripeCustomer(
  workspaceId: string,
): Promise<{ ok: true; stripeCustomerId: string } | { ok: false; error: string; status: number }> {
  const [workspace] = await adminDb
    .select({ stripe_id: workspaceTable.stripe_id })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);

  if (!workspace) {
    return {
      ok: false,
      error: "We could not load billing for this workspace.",
      status: 400,
    };
  }

  let stripeCustomerId = workspace.stripe_id ?? null;

  if (!stripeCustomerId) {
    try {
      const customer = await createStripeContact({
        workspace_id: workspaceId,
      });
      stripeCustomerId = customer.id;

      await adminDb
        .update(workspaceTable)
        .set({ stripe_id: stripeCustomerId })
        .where(eq(workspaceTable.id, workspaceId));
    } catch {
      return {
        ok: false,
        error:
          "Billing is not ready for this workspace yet. Please try again in a moment or contact support.",
        status: 400,
      };
    }
  }

  return { ok: true, stripeCustomerId };
}

export async function getWorkspaceBilling(
    userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const [workspace] = await adminDb
    .select({ credits: workspaceTable.credits })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);

  if (!workspace) {
    logger.error("getWorkspaceBilling workspace error", { workspaceId });
    return {
      ok: false as const,
      error: "Workspace not found",
      status: 404,
    };
  }

  const tdb = createTenantDb(workspaceId);
  const history = await tdb.transaction_history.findMany({
    columns: {
      id: true,
      created_at: true,
      type: true,
      amount: true,
      note: true,
      idempotency_key: true,
    },
    orderBy: (row, { desc: descFn }) => [descFn(row.created_at)],
    limit: 500,
  });

  return {
    ok: true as const,
    balance: workspace.credits ?? 0,
    transactions: history,
    pricing: billingPricing,
  };
}

export async function createBillingCheckoutSession(args: {
  userId: string;
  workspaceId: string;
  amount: number;
  requestUrl: string;
}) {
  const { userId, workspaceId, amount, requestUrl } = args;

  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  if (!Number.isFinite(amount) || amount < MIN_CREDITS) {
    return {
      ok: false as const,
      error: `Choose at least ${formatCredits(MIN_CREDITS)} credits (${formatCurrency(MIN_PURCHASE_CAD)} minimum).`,
      status: 400,
    };
  }

  const customerResult = await ensureStripeCustomer(workspaceId);
  if (!customerResult.ok) {
    return customerResult;
  }

  try {
    const baseUrl = new URL(requestUrl).origin;
    const stripe = createStripeClient();
    const priceInCents = Math.round(amount * CREDIT_PRICE_CAD * 100);
    const session = await stripe.checkout.sessions.create({
      customer: customerResult.stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "cad",
            product_data: {
              name: "Workspace credits",
              description: `${formatCredits(amount)} credits for your workspace`,
            },
            unit_amount: priceInCents,
            tax_behavior: "exclusive",
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${baseUrl}/confirm-payment?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/workspaces/${workspaceId}/billing?payment_status=canceled`,
      metadata: {
        workspaceId,
        creditAmount: String(amount),
      },
    });

    if (!session.url || !session.id) {
      return {
        ok: false as const,
        error: "We could not open Stripe Checkout right now. Please try again.",
        status: 400,
      };
    }

    return {
      ok: true as const,
      checkout_url: session.url,
      session_id: session.id,
      pricing: billingPricing,
    };
  } catch (error) {
    logger.error("createBillingCheckoutSession error", error);
    return {
      ok: false as const,
      error: "We could not open Stripe Checkout right now. Please try again.",
      status: 400,
    };
  }
}

export type BillingSessionPollStatus =
  | "open"
  | "complete"
  | "expired"
  | "unknown";

export async function pollBillingCheckoutSession(args: {
  userId: string;
  workspaceId: string;
  sessionId: string;
}) {
  const { userId, workspaceId, sessionId } = args;

  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const stripe = createStripeClient();
  let session: Stripe.Checkout.Session;

  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    logger.error("pollBillingCheckoutSession retrieve error", error);
    return {
      ok: false as const,
      error: "Checkout session not found.",
      status: 404,
    };
  }

  const sessionWorkspaceId = session.metadata?.workspaceId ?? null;
  if (sessionWorkspaceId !== workspaceId) {
    return {
      ok: false as const,
      error: "Checkout session does not belong to this workspace.",
      status: 403,
    };
  }

  const creditAmount = Number(session.metadata?.creditAmount ?? 0);
  const status = (session.status ?? "unknown") as BillingSessionPollStatus;
  const paymentStatus = session.payment_status ?? "unpaid";

  if (status !== "complete" || paymentStatus !== "paid") {
    return {
      ok: true as const,
      status,
      payment_status: paymentStatus,
      confirmed: false,
      credits_added: null as number | null,
    };
  }

  if (!creditAmount) {
    return {
      ok: false as const,
      error: "Invalid session metadata.",
      status: 400,
    };
  }

  try {
    const result = await insertTransactionHistoryIdempotent(db, {
      workspaceId,
      type: "CREDIT",
      amount: creditAmount,
      note: `Added ${creditAmount} credits, stripe_session:${sessionId}`,
      idempotencyKey: stripeSessionKey(sessionId),
    });

    return {
      ok: true as const,
      status,
      payment_status: paymentStatus,
      confirmed: true,
      credits_added: creditAmount,
      inserted: result.inserted,
    };
  } catch (error) {
    logger.error("pollBillingCheckoutSession confirm error", error);
    return {
      ok: false as const,
      error:
        "We could not confirm this payment yet. If your card was charged, please contact support.",
      status: 500,
    };
  }
}

export async function confirmStripeCheckoutSessionForRedirect(args: {
  sessionId: string;
}) {
  const { sessionId } = args;
  const stripe = createStripeClient();
  let fallbackWorkspaceId: string | null = null;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Capture the workspace before any throw below: it is what lets the caller
    // redirect the user back to their own billing page instead of dumping them
    // on the workspace list with a context-free error.
    const workspaceId = session.metadata?.workspaceId ?? null;
    fallbackWorkspaceId = workspaceId;

    // `status: "complete"` only means the Checkout Session finished, not that
    // money moved — it fires with payment_status "unpaid" for delayed-notification
    // methods and "no_payment_required" for zero-amount sessions. Both sibling
    // paths (pollBillingCheckoutSession, the stripe-webhook handler) check both
    // fields; this is the primary grant path and was the one missing it.
    if (session.status !== "complete" || session.payment_status !== "paid") {
      throw new Error("Payment not completed");
    }

    const creditAmount = Number(session.metadata?.creditAmount);

    if (!workspaceId || !creditAmount) {
      throw new Error("Invalid session metadata");
    }

    await insertTransactionHistoryIdempotent(db, {
      workspaceId,
      type: "CREDIT",
      amount: creditAmount,
      note: `Added ${creditAmount} credits, stripe_session:${sessionId}`,
      idempotencyKey: stripeSessionKey(sessionId),
    });

    return {
      ok: true as const,
      workspaceId,
      creditAmount,
    };
  } catch (error) {
    logger.error("confirmStripeCheckoutSessionForRedirect error", error);
    return {
      ok: false as const,
      workspaceId: fallbackWorkspaceId,
      error,
    };
  }
}

/** Ledger keys and notes carry the Checkout Session id; the receipt lives on its charge or invoice. */
function stripeSessionIdForLedgerRow(row: { idempotency_key: string | null; note: string | null }): string | null {
  const key = row.idempotency_key ?? "";
  if (key.startsWith("stripe_session:")) return key.slice("stripe_session:".length) || null;
  const fromNote = /stripe_session:(cs_[A-Za-z0-9_]+)/.exec(row.note ?? "");
  return fromNote?.[1] ?? null;
}

/**
 * Resolve the Stripe-hosted receipt for one credit purchase on the ledger
 * (#1322). Workspace-scoped: the row is read through the tenant db and the
 * session's metadata must name the same workspace, so a transaction id from
 * another workspace yields 404/403, never a receipt. Failures are typed so the
 * route can answer honestly instead of a bare 500.
 */
export async function getPurchaseReceiptUrl(args: {
  userId: string;
  workspaceId: string;
  transactionId: number;
}): Promise<{ ok: true; url: string } | { ok: false; error: string; status: number }> {
  const { userId, workspaceId, transactionId } = args;
  await requireWorkspaceAccess({ user: { id: userId }, workspaceId });
  const tdb = createTenantDb(workspaceId);
  const row = await tdb.transaction_history.findFirst({
    where: eq(transactionHistoryTable.id, transactionId),
    columns: { id: true, type: true, idempotency_key: true, note: true },
  });
  if (!row || row.type !== "CREDIT") {
    return { ok: false as const, error: "No receipt for this entry.", status: 404 };
  }
  const sessionId = stripeSessionIdForLedgerRow(row);
  if (!sessionId) {
    return { ok: false as const, error: "No receipt for this entry.", status: 404 };
  }
  const stripe = createStripeClient();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.latest_charge", "invoice"],
    });
  } catch (error) {
    logger.error("getPurchaseReceiptUrl retrieve error", { workspaceId, transactionId, error });
    return { ok: false as const, error: "Could not reach the payment provider.", status: 502 };
  }
  if ((session.metadata?.workspaceId ?? null) !== workspaceId) {
    return { ok: false as const, error: "Receipt does not belong to this workspace.", status: 403 };
  }
  const invoice = session.invoice;
  const hostedInvoiceUrl =
    invoice && typeof invoice !== "string" ? invoice.hosted_invoice_url ?? null : null;
  const paymentIntent = session.payment_intent;
  const charge =
    paymentIntent && typeof paymentIntent !== "string" ? paymentIntent.latest_charge : null;
  const receiptUrl = charge && typeof charge !== "string" ? charge.receipt_url ?? null : null;
  const url = hostedInvoiceUrl ?? receiptUrl;
  if (!url) {
    return { ok: false as const, error: "Receipt not available yet.", status: 404 };
  }
  return { ok: true as const, url };
}
