import {
  getTransactionDisplayDescription,
  type TransactionType,
} from "@/lib/transaction-history.server";
import { createStripeContact } from "@/lib/database/stripe.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { verifyAuth } from "@/lib/supabase.server";
import Stripe from "stripe";
import type { LoaderFunctionArgs } from "react-router";
import {
  CREDIT_PRICE_CAD,
  MIN_CREDITS,
  MIN_PURCHASE_CAD,
} from "@/lib/billing-format";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (!workspaceId) throw new Error("Workspace ID is required");

  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select("credits, stripe_id")
    .eq("id", workspaceId)
    .single();

  if (workspaceError) throw workspaceError;

  const { data: history, error: historyError } = await supabaseClient
    .from("transaction_history")
    .select("id, created_at, type, amount, note, idempotency_key")
    .eq("workspace", workspaceId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (historyError) throw historyError;

  return routeData({
    credits: {
      balance: workspace?.credits ?? 0,
      history: history ?? [],
    },
  });
}
