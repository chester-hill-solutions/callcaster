import { bucketFromIdempotencyKey } from "../../shared/billing-keys";

export type TransactionType = "DEBIT" | "CREDIT";

export type BillingEventSource =
  | "sms"
  | "voice"
  | "number_rental"
  | "purchase"
  | "adjustment"
  | "unknown";

function bucketToEventSource(
  bucket: ReturnType<typeof bucketFromIdempotencyKey>,
  type: TransactionType,
  hasKey: boolean,
): BillingEventSource {
  switch (bucket) {
    case "sms":
      return "sms";
    case "voice":
      return "voice";
    case "numbers":
      return "number_rental";
    case "purchase":
      return "purchase";
    case "other":
      if (type === "CREDIT") return "purchase";
      if (type === "DEBIT" && !hasKey) return "adjustment";
      return "unknown";
  }
}

export function getBillingEventSource(args: {
  type: TransactionType;
  idempotencyKey?: string | null;
}): BillingEventSource {
  const key = args.idempotencyKey?.trim() ?? "";
  const bucket = bucketFromIdempotencyKey(key);
  return bucketToEventSource(bucket, args.type, Boolean(key));
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
