export { loader } from "./billing.loader.server";
export { action } from "./billing.action.server";

import { data as routeData, redirect, type LoaderFunctionArgs, type ActionFunctionArgs, useLoaderData, Form, useActionData, useSearchParams, useNavigation } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from "react";

import Stripe from "stripe";


import {
  getTransactionDisplayDescription,
  getBillingEventSource,
  getBillingEventSourceLabel,
  type TransactionType,
} from "@/lib/transaction-history.server";
import {
  CREDIT_PRICE_CAD,
  MIN_CREDITS,
  MIN_PURCHASE_CAD,
  formatCredits,
  formatCurrency,
  formatUnitPrice,
} from "@/lib/billing-format";

type TransactionRow = {
  id: string;
  created_at: string;
  type: string;
  amount: number;
  note?: string | null;
  idempotency_key?: string | null;
};

type LoaderData = {
  credits: {
    balance: number;
    history: TransactionRow[];
  };
};

export default function Credits() {
  const { credits } = useLoaderData<LoaderData>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const [selectedAmount, setSelectedAmount] = useState<number>(MIN_CREDITS);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isCustom, setIsCustom] = useState(false);
  const actionData = useActionData();

  const paymentStatus = searchParams.get("payment_status");
  const paymentMessage = searchParams.get("payment_message");
  const creditsAdded = Number(searchParams.get("credits_added") || "0");
  const isSubmitting = navigation.state === "submitting";
  const selectedCredits = isCustom ? Number(customAmount || "0") : selectedAmount;
  const estimatedCost = selectedCredits > 0 ? selectedCredits * CREDIT_PRICE_CAD : 0;
  const creditPackages = [
    { amount: 500, price: 10 },
    { amount: 1250, price: 25 },
    { amount: 2500, price: 50 },
    { amount: 5000, price: 100 },
    { amount: 12500, price: 250 },
    { amount: 25000, price: 500 },
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
            <div>SMS: 1 credit per segment ($0.02)</div>
            <div>
              IVR / auto-dial: 2 credits per dial ($0.04), then 3 credits per
              additional minute ($0.06)
            </div>
            <div>
              Live staffed calls: 4 credits per dial ($0.08), then 5 credits per
              additional minute ($0.10)
            </div>
            <div>Phone numbers: 100 credits per month ($2.00)</div>
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

      {/* Credit Usage Log */}
      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold">Credit Usage Log</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left">Date</th>
                <th className="pb-2 text-left">Source</th>
                <th className="pb-2 text-left">Description</th>
                <th className="pb-2 text-left">Idempotency key</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {credits.history.map((transaction: TransactionRow) => {
                const source = getBillingEventSource({
                  type: transaction.type as TransactionType,
                  idempotencyKey:
                    "idempotency_key" in transaction &&
                    typeof transaction.idempotency_key === "string"
                      ? transaction.idempotency_key
                      : null,
                });
                return (
                  <tr key={transaction.id} className="border-b">
                    <td className="py-2 whitespace-nowrap">
                      {new Date(transaction.created_at).toLocaleString()}
                    </td>
                    <td className="py-2">{getBillingEventSourceLabel(source)}</td>
                    <td className="py-2 px-2 max-w-xs text-xs">
                      {getTransactionDisplayDescription({
                        type: transaction.type as TransactionType,
                        amount: transaction.amount,
                        note:
                          "note" in transaction && typeof transaction.note === "string"
                            ? transaction.note
                            : null,
                      })}
                    </td>
                    <td className="py-2 font-mono text-xs text-muted-foreground">
                      {typeof transaction.idempotency_key === "string"
                        ? transaction.idempotency_key
                        : "—"}
                    </td>
                    <td
                      className={`py-2 text-right ${
                        transaction.type === "CREDIT" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {transaction.amount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
