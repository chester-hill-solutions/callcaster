import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import Stripe from "stripe";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";

function buildBillingRedirect(
  workspaceId: string,
  params: Record<string, string | number>,
) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  return redirect(`/workspaces/${workspaceId}/billing?${searchParams.toString()}`);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return redirect("/workspaces");
  }

  // Preserve path+query so after sign-in user returns to confirm-payment with session_id
  const nextUrl = url.pathname + (url.search ?? "");
  const { supabaseClient } = await verifyAuth(request, nextUrl);

  const stripe = new Stripe(env.STRIPE_SECRET_KEY());
  let fallbackWorkspaceId: string | null = null;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.status !== "complete") {
      throw new Error("Payment not completed");
    }

    const workspaceId = session.metadata?.["workspaceId"] ?? null;
    const creditAmount = Number(session.metadata?.["creditAmount"]);
    fallbackWorkspaceId = workspaceId;

    if (!workspaceId || !creditAmount) {
      throw new Error("Invalid session metadata");
    }

    await insertTransactionHistoryIdempotent({
      supabase: supabaseClient,
      workspaceId,
      type: "CREDIT",
      amount: creditAmount,
      note: `Added ${creditAmount} credits, stripe_session:${sessionId}`,
      idempotencyKey: `stripe_session:${sessionId}`,
    });

    return buildBillingRedirect(workspaceId, {
      payment_status: "success",
      credits_added: creditAmount,
    });
  } catch (error) {
    logger.error("Payment confirmation error:", error);

    if (fallbackWorkspaceId) {
      return buildBillingRedirect(fallbackWorkspaceId, {
        payment_status: "error",
        payment_message:
          "We could not confirm this payment yet. If your card was charged, please contact support.",
      });
    }

    return redirect(
      "/workspaces?payment_status=error&payment_message=We%20could%20not%20confirm%20this%20payment.",
    );
  }
}

export default function ConfirmPayment() {
  return <div>Processing payment...</div>;
} 