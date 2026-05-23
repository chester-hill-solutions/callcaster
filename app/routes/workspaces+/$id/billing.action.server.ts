import { data as routeData, redirect, type LoaderFunctionArgs, type ActionFunctionArgs, useLoaderData, Form, useActionData, useSearchParams, useNavigation } from "react-router";
import Stripe from "stripe";
import {
  getTransactionDisplayDescription,
  type TransactionType,
} from "@/lib/transaction-history.server";
import { data as routeData, redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { createStripeContact } from "@/lib/database/stripe.server";
import { env } from "@/lib/env.server";
import { verifyAuth } from "@/lib/supabase.server";

export async function action({ request, params }: ActionFunctionArgs) {



  const { supabaseClient } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!workspaceId) throw new Error("Workspace ID is required");

  const formData = await request.formData();
  const amount = Math.floor(Number(formData.get("amount")));

  if (!Number.isFinite(amount) || amount < MIN_CREDITS) {
    return routeData({
      error: `Choose at least ${formatCredits(MIN_CREDITS)} credits (${formatCurrency(MIN_PURCHASE_CAD)} minimum).`,
    }, { status: 400 });
  }

  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select("stripe_id")
    .eq("id", workspaceId)
    .single();

  if (workspaceError) {
    return routeData({ error: "We could not load billing for this workspace." }, { status: 400 });
  }

  let stripeCustomerId = workspace?.stripe_id ?? null;

  if (!stripeCustomerId) {
    try {
      const customer = await createStripeContact({
        supabaseClient,
        workspace_id: workspaceId,
      });
      stripeCustomerId = customer.id;

      await supabaseClient
        .from("workspace")
        .update({ stripe_id: stripeCustomerId })
        .eq("id", workspaceId);
    } catch {
      return routeData(
        {
          error:
            "Billing is not ready for this workspace yet. Please try again in a moment or contact support.",
        },
        { status: 400 },
      );
    }
  }

  try {
    const baseUrl = new URL(request.url).origin;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY());
    const priceInCents = Math.round(amount * CREDIT_PRICE_CAD * 100);
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
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
        creditAmount: amount,
      },
    });

    return redirect(session.url!);
  } catch {
    return routeData(
      {
        error: "We could not open Stripe Checkout right now. Please try again.",
      },
      { status: 400 },
    );
  }
}
