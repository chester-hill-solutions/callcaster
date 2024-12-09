import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import Stripe from "stripe";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabaseClient } = await getSupabaseServerClientWithSession(request);
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return redirect("/workspaces");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.status !== "complete") {
      throw new Error("Payment not completed");
    }

    const workspaceId = session.metadata?.workspaceId;
    const creditAmount = Number(session.metadata?.creditAmount);

    if (!workspaceId || !creditAmount) {
      throw new Error("Invalid session metadata");
    }

    // Create transaction history entry instead of updating credits directly
    const { error } = await supabaseClient.from("transaction_history").insert({
      workspace: workspaceId,
      amount: creditAmount,
      type: 'CREDIT',
      note: `stripe_session:${sessionId}`,
      created_at: new Date().toISOString()
    });

    if (error) {
      throw error;
    }

    // Redirect to workspace credits page with success message
    return redirect(`/workspaces/${workspaceId}/settings/credits?success=true`);

  } catch (error) {
    console.error("Payment confirmation error:", error);
    
    // If we have the workspaceId in the session metadata, use it for redirect
    const workspaceId = sessionId ? 
      (await stripe.checkout.sessions.retrieve(sessionId)).metadata?.workspaceId : 
      null;

    if (workspaceId) {
      return redirect(`/workspaces/${workspaceId}/settings/credits?error=true`);
    }
    
    // Fallback to workspaces page if we can't get the workspaceId
    return redirect("/workspaces?error=payment_failed");
  }
}

export default function ConfirmPayment() {
  return <div>Processing payment...</div>;
} 