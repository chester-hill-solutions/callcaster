export type TransactionType = "DEBIT" | "CREDIT";

export function getTransactionDisplayDescription(args: {
  type: TransactionType;
  amount: number;
  note?: string | null;
}): string {
  const rawNote = args.note ?? "";
  const withoutMarker = rawNote
    .replace(/\s*\[idempotency:[^\]]+\]\s*/g, " ")
    .trim();
  const withoutStripeSession = withoutMarker
    .replace(/,?\s*stripe_session:[^\s,]+/g, "")
    .trim();

  if (withoutStripeSession) {
    return withoutStripeSession;
  }

  if (args.type === "CREDIT") {
    return `Added ${args.amount} credits`;
  }

  return `Used ${args.amount} credits`;
}
