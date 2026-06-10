export type TransactionType = "DEBIT" | "CREDIT";

export type BillingEventSource =
  | "sms"
  | "voice"
  | "number_rental"
  | "purchase"
  | "adjustment"
  | "unknown";

export function getBillingEventSource(args: {
  type: TransactionType;
  idempotencyKey?: string | null;
}): BillingEventSource {
  const key = args.idempotencyKey?.trim() ?? "";
  if (key.startsWith("sms:")) return "sms";
  if (key.startsWith("call:")) return "voice";
  if (key.startsWith("number_rent:") || key.startsWith("number_rent_purchase:")) {
    return "number_rental";
  }
  if (key.startsWith("stripe_evt:") || key.startsWith("stripe_session:")) {
    return "purchase";
  }
  if (args.type === "CREDIT") return "purchase";
  if (args.type === "DEBIT" && !key) return "adjustment";
  return "unknown";
}

export function getBillingEventSourceLabel(source: BillingEventSource): string {
  switch (source) {
    case "sms":
      return "SMS";
    case "voice":
      return "Voice";
    case "number_rental":
      return "Number rental";
    case "purchase":
      return "Purchase";
    case "adjustment":
      return "Adjustment";
    default:
      return "Other";
  }
}

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
