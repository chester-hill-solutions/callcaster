import { type ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import type { Database } from "@/lib/database.types";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET();
  if (!webhookSecret) {
    logger.warn("Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook secret not configured", { status: 503 });
  }

  const signature = request.headers.get("Stripe-Signature");
  if (!signature) {
    return new Response("Missing Stripe-Signature header", { status: 400 });
  }

  let body: string;
  try {
    body = await request.text();
  } catch (e) {
    logger.error("Stripe webhook: failed to read body", e);
    return new Response("Invalid body", { status: 400 });
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY(), {
    apiVersion: "2024-06-20",
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.warn("Stripe webhook signature verification failed", { message });
    return new Response(`Webhook signature verification failed: ${message}`, {
      status: 400,
    });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const workspaceId = session.metadata?.["workspaceId"] ?? null;
    const creditAmount = Number(session.metadata?.["creditAmount"]);

    if (!workspaceId || !Number.isFinite(creditAmount) || creditAmount <= 0) {
      logger.warn("Stripe webhook checkout.session.completed with invalid metadata", {
        workspaceId,
        creditAmount: session.metadata?.["creditAmount"],
      });
      return new Response("OK", { status: 200 });
    }

    const supabase = createClient<Database>(
      env.SUPABASE_URL(),
      env.SUPABASE_SERVICE_KEY(),
    );

    const { inserted } = await insertTransactionHistoryIdempotent({
      supabase,
      workspaceId,
      type: "CREDIT",
      amount: creditAmount,
      note: `Added ${creditAmount} credits, stripe_evt:${event.id}`,
      idempotencyKey: `stripe_evt:${event.id}`,
    });

    if (inserted) {
      logger.debug("Stripe webhook: credited workspace from checkout.session.completed", {
        workspaceId,
        creditAmount,
        eventId: event.id,
      });
    }
  }

  return new Response("OK", { status: 200 });
};
