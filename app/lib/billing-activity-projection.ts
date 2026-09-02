import type { TransactionType } from "@/lib/transaction-history-display";

export type BillingActivityRow = {
  id: string;
  created_at: string;
  type: TransactionType;
  amount: number;
  note?: string | null;
  idempotency_key?: string | null;
  /** Campaign the usage belongs to, when the ledger row records one. */
  campaign_id?: number | null;
};

export type BillingReference = {
  provider: "Stripe" | "Twilio" | "CallCaster" | "Other";
  reference: string | null;
};

export type BillingActivityProjection = {
  id: string;
  occurredAt: string;
  activity: string;
  amount: string;
  direction: "credit" | "debit";
  advanced: BillingReference & {
    idempotencyKey: string | null;
    rawNote: string | null;
  };
};

const SAFE_REFERENCE_PART = /^[A-Za-z0-9._+-]+$/;

function safePart(value: string | undefined): string | null {
  if (!value || value.length > 200 || !SAFE_REFERENCE_PART.test(value)) {
    return null;
  }
  return value;
}

export function parseBillingReference(
  idempotencyKey: string | null | undefined,
): BillingReference {
  const key = idempotencyKey?.trim() ?? "";

  if (key.startsWith("stripe_session:")) {
    return {
      provider: "Stripe",
      reference: safePart(key.slice("stripe_session:".length)),
    };
  }
  if (key.startsWith("stripe_evt:")) {
    return {
      provider: "Stripe",
      reference: safePart(key.slice("stripe_evt:".length)),
    };
  }
  if (key.startsWith("sms:")) {
    return {
      provider: "Twilio",
      reference: safePart(key.slice("sms:".length)),
    };
  }
  if (key.startsWith("call:")) {
    const [callSid] = key.slice("call:".length).split(":");
    return { provider: "Twilio", reference: safePart(callSid) };
  }
  if (key.startsWith("number_rent_purchase:")) {
    const parts = key.slice("number_rent_purchase:".length).split(":");
    return {
      provider: "Twilio",
      reference: parts.length === 2 ? safePart(parts[1]) : null,
    };
  }
  if (key.startsWith("number_rent:")) {
    const parts = key.slice("number_rent:".length).split(":");
    const numberId = safePart(parts[0]);
    const cycle = safePart(parts[1]);
    return {
      provider: "CallCaster",
      reference:
        parts.length === 2 && numberId && cycle
          ? `${numberId} · ${cycle}`
          : null,
    };
  }
  if (key.startsWith("welcome-credits:")) {
    return {
      provider: "CallCaster",
      reference: safePart(key.slice("welcome-credits:".length)),
    };
  }

  return {
    provider: key ? "Other" : "CallCaster",
    reference: null,
  };
}

function getActivity(
  type: TransactionType,
  idempotencyKey: string | null | undefined,
): string {
  const key = idempotencyKey?.trim() ?? "";

  if (key.startsWith("welcome-credits:")) return "Welcome credits";
  if (key.startsWith("stripe_session:") || key.startsWith("stripe_evt:")) {
    return "Credit purchase";
  }
  if (key.startsWith("sms:")) return "SMS messaging";
  if (key.startsWith("call:")) return "Voice calling";
  if (
    key.startsWith("number_rent:") ||
    key.startsWith("number_rent_purchase:")
  ) {
    return "Phone number rental";
  }
  if (!key) return "Credit adjustment";

  switch (type) {
    case "CREDIT":
      return "Credits added";
    case "DEBIT":
      return "Credit usage";
    default: {
      const exhaustiveType: never = type;
      return exhaustiveType;
    }
  }
}

export function formatSignedCreditAmount(
  type: TransactionType,
  amount: number,
): string {
  const magnitude = Math.abs(amount).toLocaleString("en-CA");

  switch (type) {
    case "CREDIT":
      return `+${magnitude} credits`;
    case "DEBIT":
      return `−${magnitude} credits`;
    default: {
      const exhaustiveType: never = type;
      return exhaustiveType;
    }
  }
}

export function projectBillingActivity(
  row: BillingActivityRow,
): BillingActivityProjection {
  return {
    id: row.id,
    occurredAt: row.created_at,
    activity: getActivity(row.type, row.idempotency_key),
    amount: formatSignedCreditAmount(row.type, row.amount),
    direction: row.type === "CREDIT" ? "credit" : "debit",
    advanced: {
      ...parseBillingReference(row.idempotency_key),
      idempotencyKey: row.idempotency_key ?? null,
      rawNote: row.note ?? null,
    },
  };
}
