import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripeContact } from "@/lib/database/stripe.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import type { Database } from "@/lib/database.types";
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

export const billingPricing = billingPricingSchema.parse({
  credit_price_cad: CREDIT_PRICE_CAD,
  min_credits: MIN_CREDITS,
  min_purchase_cad: MIN_PURCHASE_CAD,
});

function createStripeClient() {
  return new Stripe(env.STRIPE_SECRET_KEY());
}

async function ensureStripeCustomer(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<{ ok: true; stripeCustomerId: string } | { ok: false; error: string; status: number }> {
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspace")
    .select("stripe_id")
    .eq("id", workspaceId)
    .single();

  if (workspaceError) {
    return {
      ok: false,
      error: "We could not load billing for this workspace.",
      status: 400,
    };
  }

  let stripeCustomerId = workspace?.stripe_id ?? null;

  if (!stripeCustomerId) {
    try {
      const customer = await createStripeContact({
        workspace_id: workspaceId,
      });
      stripeCustomerId = customer.id;

      await supabase
        .from("workspace")
        .update({ stripe_id: stripeCustomerId })
        .eq("id", workspaceId);
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
  supabase: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user: { id: userId },
    workspaceId,
  });

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspace")
    .select("credits")
    .eq("id", workspaceId)
    .single();

  if (workspaceError) {
    logger.error("getWorkspaceBilling workspace error", workspaceError);
    return {
      ok: false as const,
      error: workspaceError.message,
      status: 500,
    };
  }

  const { data: history, error: historyError } = await supabase
    .from("transaction_history")
    .select("id, created_at, type, amount, note, idempotency_key")
    .eq("workspace", workspaceId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (historyError) {
    logger.error("getWorkspaceBilling history error", historyError);
    return {
      ok: false as const,
      error: historyError.message,
      status: 500,
    };
  }

  return {
    ok: true as const,
    balance: workspace?.credits ?? 0,
    transactions: history ?? [],
    pricing: billingPricing,
  };
}

export async function createBillingCheckoutSession(args: {
  supabase: SupabaseClient<Database>;
  userId: string;
  workspaceId: string;
  amount: number;
  requestUrl: string;
}) {
  const { supabase, userId, workspaceId, amount, requestUrl } = args;

  await requireWorkspaceAccess({
    supabaseClient: supabase,
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

  const customerResult = await ensureStripeCustomer(supabase, workspaceId);
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
  supabase: SupabaseClient<Database>;
  userId: string;
  workspaceId: string;
  sessionId: string;
}) {
  const { supabase, userId, workspaceId, sessionId } = args;

  await requireWorkspaceAccess({
    supabaseClient: supabase,
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
      supabase,
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
  supabase: SupabaseClient<Database>;
  sessionId: string;
}) {
  const { supabase, sessionId } = args;
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
      supabase,
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
