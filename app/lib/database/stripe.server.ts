/**
 * Stripe-related database functions
 */
import Stripe from "stripe";
import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { env } from "../env.server";
import { logger } from "../logger.server";

export async function createStripeContact({
  supabaseClient,
  workspace_id,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspace_id: string;
}) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .select(
      `
      name,
      workspace_users!inner(
        role,
        user:user_id(
          id,
          username
        )
      )
    `,
    )
    .eq("id", workspace_id)
    .eq("workspace_users.role", "owner")
    .single();

  if (error) {
    logger.error("Error fetching workspace data:", error);
    throw error;
  }

  if (!data || !data.workspace_users || data.workspace_users.length === 0) {
    throw new Error("No owner found for the workspace");
  }

  const ownerUser = data.workspace_users[0].user;
  if (!ownerUser) {
    throw new Error("No owner user found");
  }
  const ownerEmail = ownerUser?.username;
  if (!ownerEmail) {
    throw new Error("Owner user has no email or username");
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY(), {
    apiVersion: "2024-06-20",
  });

  return await stripe.customers.create({
    name: data.name,
    email: ownerEmail,
  });
}

export async function meterEvent({
  supabaseClient,
  workspace_id,
  amount,
  type,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspace_id: string;
  amount: number;
  type: string;
}) {
  const {
    data,
    error,
  } = await supabaseClient
    .from("workspace")
    .select("stripe_id")
    .eq("id", workspace_id)
    .single();
  if (error || !data?.stripe_id) return;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY());
  return await stripe.billing.meterEvents.create({
    event_name: type,
    payload: {
      value: amount,
      stripe_customer_id: data.stripe_id,
    },
  });
}

