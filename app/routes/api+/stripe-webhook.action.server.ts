import { env } from "@/lib/env.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { db } from "@/server/db";
import { stripeSessionKey } from "@/lib/billing-keys";
import { logger } from "@/lib/logger.server";
import Stripe from "stripe";
import { STRIPE_CLIENT_OPTIONS } from "@/lib/stripe-client-options";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  // Signature verification reads the RAW body (request.text()) — the exact
  // bytes Stripe signed. No `input` schema here; the factory must not touch
  // the body.
  auth: async ({ request }) => {
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

    const stripe = new Stripe(env.STRIPE_SECRET_KEY(), STRIPE_CLIENT_OPTIONS);

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

    return { event };
  },
  sideEffects: ["db-write", "credit"],
  handler: async ({ auth }) => {
    const { event } = auth;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.["workspaceId"] ?? null;
      const creditAmount = Number(session.metadata?.["creditAmount"]);

      if (
        session.status !== "complete" ||
        session.payment_status !== "paid" ||
        !workspaceId ||
        !Number.isFinite(creditAmount) ||
        creditAmount <= 0
      ) {
        logger.warn("Stripe webhook checkout.session.completed not eligible for credit", {
          workspaceId,
          status: session.status,
          paymentStatus: session.payment_status,
          creditAmount: session.metadata?.["creditAmount"],
        });
        return new Response("OK", { status: 200 });
      }

      const { inserted } = await insertTransactionHistoryIdempotent(db, {
        workspaceId,
        type: "CREDIT",
        amount: creditAmount,
        note: `Added ${creditAmount} credits, stripe_session:${session.id}`,
        idempotencyKey: stripeSessionKey(session.id),
      });

      if (inserted) {
        logger.debug("Stripe webhook: credited workspace from checkout.session.completed", {
          workspaceId,
          creditAmount,
          sessionId: session.id,
        });
      }
    }

    return new Response("OK", { status: 200 });
  },
});
