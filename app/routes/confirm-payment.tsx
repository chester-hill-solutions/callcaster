import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import Stripe from "stripe";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

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

    // Idempotency: skip insert if this session was already recorded (e.g. user refreshed)
    const noteContainsSession = `stripe_session:${sessionId}`;
    const { data: historyRows } = await supabaseClient
      .from("transaction_history")
      .select("id, note")
      .eq("workspace", workspaceId)
      .eq("type", "CREDIT")
      .order("created_at", { ascending: false })
      .limit(50);

    const alreadyRecorded = (historyRows ?? []).some(
      (row) => (row as { note?: string }).note?.includes(noteContainsSession)
    );
    if (alreadyRecorded) {
      return redirect(`/workspaces/${workspaceId}/billing?success=true`);
    }

    // Create transaction history entry instead of updating credits directly
    const { error } = await supabaseClient.from("transaction_history").insert({
      workspace: workspaceId,
      amount: creditAmount,
      type: "CREDIT",
      note: `Reloaded ${creditAmount} credits, stripe_session:${sessionId}`,
      created_at: new Date().toISOString(),
    } as Record<string, unknown>);

    if (error) {
      throw error;
    }

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