export { loader } from "./billing.loader.server";
export { action } from "./billing.action.server";

import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { useState } from "react";

import { Section, SectionHeader } from "@/components/shared/Section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Heading, Text } from "@/components/ui/typography";
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
  const actionData = useActionData<{ error?: string }>();

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
    <div className="space-y-6">
      <Heading as="h1" level={2} branded={false}>
        Credits
      </Heading>

      {paymentStatus === "success" ? (
        <Alert variant="success">
          <AlertTitle>Payment successful</AlertTitle>
          <AlertDescription>
            Added {formatCredits(creditsAdded)} credits successfully. Your balance
            has been refreshed.
          </AlertDescription>
        </Alert>
      ) : null}
      {paymentStatus === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Payment error</AlertTitle>
          <AlertDescription>
            {paymentMessage ||
              "We could not confirm this payment. If your card was charged, please contact support."}
          </AlertDescription>
        </Alert>
      ) : null}
      {paymentStatus === "canceled" ? (
        <Alert variant="warning">
          <AlertTitle>Checkout canceled</AlertTitle>
          <AlertDescription>
            Checkout was canceled. No charge was made.
          </AlertDescription>
        </Alert>
      ) : null}

      <Section variant="flat">
        <SectionHeader
          branded={false}
          compact
          title="Current Balance"
        />
        <div className="text-4xl font-bold text-primary">
          {credits.balance} credits
        </div>
        <Accordion type="single" collapsible className="w-full max-w-lg">
          <AccordionItem value="rates" className="border-border/60">
            <AccordionTrigger className="py-3 text-sm text-muted-foreground hover:no-underline">
              Credit rates for messaging and calling
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      <Section variant="flat">
        <SectionHeader branded={false} compact title="Purchase Credits" />
        <Form method="post" className="space-y-4">
          <input type="hidden" name="amount" value={selectedCredits || ""} />
          <Text variant="muted" className="rounded-lg border bg-muted/30 p-4">
            Credits cost {formatUnitPrice()} each. The minimum purchase is{" "}
            {formatCredits(MIN_CREDITS)} credits ({formatCurrency(MIN_PURCHASE_CAD)}).
          </Text>
          <div className="grid gap-4 md:grid-cols-3">
            {creditPackages.map((pkg) => (
              <button
                type="button"
                key={pkg.amount}
                className={`w-full rounded-lg border p-4 text-left transition-colors duration-150 ${
                  selectedAmount === pkg.amount && !isCustom
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
                onClick={() => {
                  setSelectedAmount(pkg.amount);
                  setIsCustom(false);
                }}
              >
                <div className="text-2xl font-bold">{formatCredits(pkg.amount)} credits</div>
                <div className="text-muted-foreground">{formatCurrency(pkg.price)}</div>
              </button>
            ))}
            <div
              role="button"
              tabIndex={0}
              className={`rounded-lg border p-4 transition-colors duration-150 ${
                isCustom
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
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
              <Input
                type="number"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setIsCustom(true);
                }}
                className="mt-2"
                placeholder="Enter credits"
                min={MIN_CREDITS}
              />
              <Text variant="small" className="mt-1">
                {isCustom && selectedCredits > 0 && `${formatCurrency(estimatedCost)} CAD`}
              </Text>
            </div>
          </div>

          <div className="rounded-md bg-muted/30 p-4">
            <Text variant="muted">Checkout summary</Text>
            <p className="mt-1 text-lg font-semibold">
              {selectedCredits > 0
                ? `${formatCredits(selectedCredits)} credits for ${formatCurrency(estimatedCost)}`
                : "Select a package or enter a custom credit amount"}
            </p>
          </div>

          {actionData?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{actionData.error}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            disabled={isSubmitting || selectedCredits < MIN_CREDITS}
          >
            {isSubmitting ? "Redirecting to checkout…" : "Purchase Credits"}
          </Button>
        </Form>
      </Section>

      <Section variant="flat">
        <SectionHeader branded={false} compact title="Credit Usage Log" />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Idempotency key</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                  <TableRow key={transaction.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(transaction.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{getBillingEventSourceLabel(source)}</TableCell>
                    <TableCell className="max-w-xs text-xs">
                      {getTransactionDisplayDescription({
                        type: transaction.type as TransactionType,
                        amount: transaction.amount,
                        note:
                          "note" in transaction &&
                          typeof transaction.note === "string"
                            ? transaction.note
                            : null,
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {typeof transaction.idempotency_key === "string"
                        ? transaction.idempotency_key
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        transaction.type === "CREDIT"
                          ? "text-success"
                          : "text-destructive"
                      }`}
                    >
                      {transaction.amount}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
