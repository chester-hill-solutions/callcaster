import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import Stripe from "stripe";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";

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
      supabase: supabaseClient as any,
      workspaceId,
      type: "CREDIT",
      amount: creditAmount,
      note: `Reloaded ${creditAmount} credits, stripe_session:${sessionId}`,
      idempotencyKey: `stripe_session:${sessionId}`,
    });

    return redirect(`/workspaces/${workspaceId}/billing?success=true`);
  } catch (error) {
    logger.error("Payment confirmation error:", error);

    if (fallbackWorkspaceId) {
      return redirect(`/workspaces/${fallbackWorkspaceId}/billing?error=true`);
    }

    return redirect("/workspaces?error=payment_failed");
  }
}

export default function ConfirmPayment() {
  return <div>Processing payment...</div>;
} 