import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { workspace as workspaceTable } from "@/db/schema";
import { createStripeContact } from "@/lib/database/stripe.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
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

export const billingPricing = billingPricingSchema.parse({
  credit_price_cad: CREDIT_PRICE_CAD,
  min_credits: MIN_CREDITS,
  min_purchase_cad: MIN_PURCHASE_CAD,
});

function createStripeClient() {
  return new Stripe(env.STRIPE_SECRET_KEY());
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
    const result = await insertTransactionHistoryIdempotent({
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

    if (session.status !== "complete") {
      throw new Error("Payment not completed");
    }

    const workspaceId = session.metadata?.workspaceId ?? null;
    const creditAmount = Number(session.metadata?.creditAmount);
    fallbackWorkspaceId = workspaceId;

    if (!workspaceId || !creditAmount) {
      throw new Error("Invalid session metadata");
    }

    await insertTransactionHistoryIdempotent({
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
