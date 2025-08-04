import { json, type LoaderFunctionArgs, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useActionData } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { useState } from "react";
import { verifyAuth } from "~/lib/supabase.server";
import Stripe from "stripe";

async function getStripeCustomerHistory(stripeCustomerId: string) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const history = await stripe.checkout.sessions.list({
    customer: stripeCustomerId,
  });
  return history;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (!workspaceId) throw new Error("Workspace ID is required");
  const { data: workspace, error: workspaceError } = await supabaseClient.from("workspace").select("credits, stripe_id, transaction_history(*)").eq("id", workspaceId).single();
  //  const stripeCustomerHistory = await getStripeCustomerHistory(workspace?.stripe_id || "");

  if (workspaceError) throw workspaceError;
  return json({
    credits: {
      balance: workspace?.credits || 0,
      history: workspace?.transaction_history.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || [],
    },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!workspaceId) throw new Error("Workspace ID is required");

  const formData = await request.formData();
  const amount = Number(formData.get("amount"));

  if (!amount || amount * 0.003 < 0.5) {
    return { error: "Invalid amount. Minimum amount is $0.50." };
  }

  const { data: workspace } = await supabaseClient
    .from("workspace")
    .select("stripe_id")
    .eq("id", workspaceId)
    .single();

  if (!workspace?.stripe_id) {
    throw new Error("Workspace has no Stripe ID");
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key is not set");
  }
  if (!process.env.BASE_URL) {
    throw new Error("Base URL is not set");
  }
  if (!workspaceId) {
    throw new Error("Workspace ID is not set");
  }
  if (!amount) {
    throw new Error("Amount is not set");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const priceInCents = Math.round(amount * 0.003 * 100);
  const session = await stripe.checkout.sessions.create({
    customer: workspace.stripe_id,
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "cad",
          product_data: {
            name: "Credits",
            description: `${amount} credits for your workspace`,
          },
          unit_amount: priceInCents,
          tax_behavior: "exclusive",
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `https://callcaster.ca/confirm-payment?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://callcaster.ca/workspaces/${workspaceId}/billing?canceled=true`,
    metadata: {
      workspaceId,
      creditAmount: amount,
    },
  });

  return redirect(session.url!);
}

export default function Credits() {
  const { credits } = useLoaderData<typeof loader>();
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isCustom, setIsCustom] = useState(false);
  const actionData = useActionData<typeof action>();
  const creditPackages = [
    { amount: 1667, price: 5 },
    { amount: 5000, price: 15 },
    { amount: 8333, price: 25 },
    { amount: 16667, price: 50 },
    { amount: 33333, price: 100 },
    { amount: 66667, price: 200 },
  ];
  // Update the transaction display
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-8 text-3xl font-bold">Credits</h1>

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
          <div className="grid gap-4 md:grid-cols-3">
            {creditPackages.map((pkg) => (
              <div
                key={pkg.amount}
                className={`cursor-pointer rounded-lg border p-4 ${selectedAmount === pkg.amount && !isCustom ? "border-primary bg-primary/5" : "border-gray-700"
                  }`}
                onClick={() => {
                  setSelectedAmount(pkg.amount);
                  setIsCustom(false);
                }}
              >
                <div className="text-2xl font-bold">{pkg.amount.toString().split("").reverse().join("").replace(/(\d{3})(?=\d)/g, "$1,").split("").reverse().join("")} credits</div>
                <div className="text-gray-600">${pkg.price}</div>
              </div>
            ))}
            <div
              className={`rounded-lg border p-4 ${isCustom ? "border-primary bg-primary/5" : "border-gray-700"
                }`}
              onClick={() => {
                setIsCustom(true);
                setSelectedAmount(0);
              }}
            >
              <div className="text-2xl font-bold">Custom Amount</div>
              <input
                type="number"
                name="amount"
                value={isCustom ? customAmount : selectedAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setIsCustom(true);
                }}
                className="mt-2 w-full rounded-md border px-2 py-1"
                placeholder="Enter amount"
                min="1"
              />
              <div className="text-gray-500 text-sm">
                {isCustom && `$${Math.round(Number(customAmount) * 0.003 * 100) / 100}`}
              </div>
              {actionData?.error && <div className="text-red-500">{actionData.error}</div>}
            </div>
          </div>

          {/* Custom amount input */}


          <Button
            type="submit"
            className="mt-4"
          >
            Purchase Credits
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
                  <td className="py-2 px-2 max-w-xs text-xs">{transaction.type === "CREDIT" ? "Credits Reloaded" : "Credits Used"} - {transaction.note ?? ""}</td>
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
