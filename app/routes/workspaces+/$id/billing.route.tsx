import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useSearchParams, useNavigation } from "@remix-run/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { verifyAuth } from "@/lib/supabase.server";
import Stripe from "stripe";
import { env } from "@/lib/env.server";
import { createStripeContact } from "@/lib/database/stripe.server";
import {
  getTransactionDisplayDescription,
  type TransactionType,
} from "@/lib/transaction-history.server";

const CREDIT_PRICE_CAD = 0.003;
const MIN_PURCHASE_CAD = 0.5;
const MIN_CREDITS = Math.ceil(MIN_PURCHASE_CAD / CREDIT_PRICE_CAD);

function formatCredits(amount: number) {
  return amount.toLocaleString();
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function formatUnitPrice() {
  return "$0.003 CAD";
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (!workspaceId) throw new Error("Workspace ID is required");
  const { data: workspace, error: workspaceError } = await supabaseClient.from("workspace").select("credits, stripe_id, transaction_history(*)").eq("id", workspaceId).single();

  if (workspaceError) throw workspaceError;
  const history = workspace?.transaction_history ?? [];
  const sortedHistory = Array.isArray(history)
    ? [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];
  return json({
    credits: {
      balance: workspace?.credits ?? 0,
      history: sortedHistory,
    },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!workspaceId) throw new Error("Workspace ID is required");

  const formData = await request.formData();
  const amount = Math.floor(Number(formData.get("amount")));

  if (!Number.isFinite(amount) || amount < MIN_CREDITS) {
    return json({
      error: `Choose at least ${formatCredits(MIN_CREDITS)} credits (${formatCurrency(MIN_PURCHASE_CAD)} minimum).`,
    }, { status: 400 });
  }

  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select("stripe_id")
    .eq("id", workspaceId)
    .single();

  if (workspaceError) {
    return json({ error: "We could not load billing for this workspace." }, { status: 400 });
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
      return json(
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
    return json(
      {
        error: "We could not open Stripe Checkout right now. Please try again.",
      },
      { status: 400 },
    );
  }
}

export default function Credits() {
  const { credits } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const [selectedAmount, setSelectedAmount] = useState<number>(1667);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isCustom, setIsCustom] = useState(false);
  const actionData = useActionData<typeof action>();

  const paymentStatus = searchParams.get("payment_status");
  const paymentMessage = searchParams.get("payment_message");
  const creditsAdded = Number(searchParams.get("credits_added") || "0");
  const isSubmitting = navigation.state === "submitting";
  const selectedCredits = isCustom ? Number(customAmount || "0") : selectedAmount;
  const estimatedCost = selectedCredits > 0 ? selectedCredits * CREDIT_PRICE_CAD : 0;
  const creditPackages = [
    { amount: 1667, price: 5 },
    { amount: 5000, price: 15 },
    { amount: 8333, price: 25 },
    { amount: 16667, price: 50 },
    { amount: 33333, price: 100 },
    { amount: 66667, price: 200 },
  ];
  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-8 text-3xl font-bold">Credits</h1>

      {paymentStatus === "success" && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          Added {formatCredits(creditsAdded)} credits successfully. Your balance has been refreshed.
        </div>
      )}
      {paymentStatus === "error" && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {paymentMessage || "We could not confirm this payment. If your card was charged, please contact support."}
        </div>
      )}
      {paymentStatus === "canceled" && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Checkout was canceled. No charge was made.
        </div>
      )}

      {/* Current Balance */}
      <Card className="mb-8 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="mb-4 text-xl font-semibold">Current Balance</h2>
            <div className="text-4xl font-bold text-primary">
              {credits.balance} credits
            </div>
          </div>
          <div className="text-sm text-gray-500 flex flex-col gap-2 max-w-xs">
            <div>
              SMS Rates: 1 credit per inbound/outbound SMS
            </div>
            <div>
              Voice Rates: 2 credits per outbound voice call attempt.
              2 credits per minute of inbound voice call (after the first minute).
            </div>
            <div>
              Interactive Voice Response (IVR) Rates: 1 credit per IVR attempt.
              1 credit per minute of IVR (after the first minute).
            </div>
          </div>
        </div>
      </Card>

      {/* Purchase Credits */}
      <Card className="mb-8 p-6">
        <h2 className="mb-4 text-xl font-semibold">Purchase Credits</h2>
        <Form method="post">
          <input type="hidden" name="amount" value={selectedCredits || ""} />
          <div className="mb-4 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Credits cost {formatUnitPrice()} each. The minimum purchase is {formatCredits(MIN_CREDITS)} credits ({formatCurrency(MIN_PURCHASE_CAD)}).
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {creditPackages.map((pkg) => (
              <button
                type="button"
                key={pkg.amount}
                className={`w-full rounded-lg border p-4 text-left ${selectedAmount === pkg.amount && !isCustom ? "border-primary bg-primary/5" : "border-gray-700"
                  }`}
                onClick={() => {
                  setSelectedAmount(pkg.amount);
                  setIsCustom(false);
                }}
              >
                <div className="text-2xl font-bold">{formatCredits(pkg.amount)} credits</div>
                <div className="text-gray-600">{formatCurrency(pkg.price)}</div>
              </button>
            ))}
            <div
              role="button"
              tabIndex={0}
              className={`rounded-lg border p-4 ${isCustom ? "border-primary bg-primary/5" : "border-gray-700"
                }`}
              onClick={() => {
                setIsCustom(true);
                setSelectedAmount(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setIsCustom(true);
                  setSelectedAmount(0);
                }
              }}
            >
              <div className="text-2xl font-bold">Custom Credits</div>
              <input
                type="number"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setIsCustom(true);
                }}
                className="mt-2 w-full rounded-md border px-2 py-1"
                placeholder="Enter credits"
                min={MIN_CREDITS}
              />
              <div className="text-gray-500 text-sm">
                {isCustom && selectedCredits > 0 && `${formatCurrency(estimatedCost)} CAD`}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Checkout summary</div>
            <div className="mt-1 text-lg font-semibold">
              {selectedCredits > 0
                ? `${formatCredits(selectedCredits)} credits for ${formatCurrency(estimatedCost)}`
                : "Select a package or enter a custom credit amount"}
            </div>
          </div>

          {actionData?.error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {actionData.error}
            </div>
          )}

          <Button
            type="submit"
            className="mt-4"
            disabled={isSubmitting || selectedCredits < MIN_CREDITS}
          >
            {isSubmitting ? "Redirecting to checkout…" : "Purchase Credits"}
          </Button>
        </Form>
      </Card>

      {/* Credit History */}
      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold">Credit History</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left">Date</th>
                <th className="pb-2 text-left">Description</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {credits.history.map((transaction) => (
                <tr key={transaction.id} className="border-b">
                  <td className="py-2">{new Date(transaction.created_at).toLocaleDateString()}</td>
                  <td className="py-2 px-2 max-w-xs text-xs">
                    {getTransactionDisplayDescription({
                      type: transaction.type as TransactionType,
                      amount: transaction.amount,
                      note: "note" in transaction && typeof transaction.note === "string" ? transaction.note : null,
                    })}
                  </td>
                  <td className={`py-2 text-right ${transaction.type === "CREDIT" ? "text-green-600" : "text-red-600"
                    }`}>
                    {transaction.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
