import Stripe from "stripe";
import { eq } from "drizzle-orm";
import {
  transaction_history as transactionHistoryTable,
  workspace as workspaceTable,
} from "@/db/schema";
import { createStripeContact } from "@/lib/database/stripe.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { MemberRole } from "@/lib/member-role";
import type { Database } from "@/lib/db-types";
import {
  CREDIT_PRICE_CAD,
  MIN_CREDITS,
  MIN_PURCHASE_CAD,
  formatCredits,
  formatCurrency,
} from "@/lib/billing-format";
import { billingPricingSchema } from "@/lib/schemas/api/platform-billing";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import {
  LEDGER_ACTIVITY_COLUMNS,
  insertTransactionHistoryIdempotent,
} from "@/lib/transaction-history.server";
import { stripeSessionKey } from "@/lib/billing-keys";
import { adminDb } from "@/server/admin-db";
import { createTenantDb } from "@/server/tenant-db";
import { db } from "@/server/db";
import { STRIPE_CLIENT_OPTIONS } from "@/lib/stripe-client-options";
import { checkoutProvider } from "../../config/server-runtime";

type CheckoutRecord = {
  id: string;
  url: string;
  status: "open" | "complete";
  payment_status: "unpaid" | "paid";
  metadata: { workspaceId: string; creditAmount: string };
};
const localCheckoutSessions = new Map<string, CheckoutRecord>();

function retrieveCheckoutSession(
  sessionId: string,
): Promise<Stripe.Checkout.Session | CheckoutRecord> {
  if (checkoutProvider === "mock") {
    const session = localCheckoutSessions.get(sessionId);
    if (!session) throw new Error("Checkout session not found");
    return Promise.resolve(session);
  }
  return createStripeClient().checkout.sessions.retrieve(sessionId);
}

/** Complete a local mock session only after the local checkout UI is submitted. */
export async function completeLocalMockCheckout(args: {
  userId: string;
  sessionId: string;
}) {
  if (checkoutProvider !== "mock") return { ok: false as const, status: 404 };
  const session = localCheckoutSessions.get(args.sessionId);
  if (!session) return { ok: false as const, status: 404 };
  await requireWorkspaceAccess({
    user: { id: args.userId },
    workspaceId: session.metadata.workspaceId,
    minRole: MemberRole.Admin,
  });
  session.status = "complete";
  session.payment_status = "paid";
  return { ok: true as const, workspaceId: session.metadata.workspaceId };
}

export function getLocalMockCheckout(sessionId: string) {
  if (checkoutProvider !== "mock") return null;
  const session = localCheckoutSessions.get(sessionId);
  return session
    ? { creditAmount: Number(session.metadata.creditAmount) }
    : null;
}

export const billingPricing = billingPricingSchema.parse({
  credit_price_cad: CREDIT_PRICE_CAD,
  min_credits: MIN_CREDITS,
  min_purchase_cad: MIN_PURCHASE_CAD,
});

function createStripeClient() {
  return new Stripe(env.STRIPE_SECRET_KEY(), STRIPE_CLIENT_OPTIONS);
}

async function ensureStripeCustomer(
  workspaceId: string,
): Promise<
  | { ok: true; stripeCustomerId: string }
  | { ok: false; error: string; status: number }
> {
  const [workspace] = await adminDb
    .select({
      stripe_id: workspaceTable.stripe_id,
      stripe_customer_conflict: workspaceTable.stripe_customer_conflict,
      stripe_customer_creation: workspaceTable.stripe_customer_creation,
      stripe_customer_creation_completed_id:
        workspaceTable.stripe_customer_creation_completed_id,
    })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);

  if (!workspace) {
    return {
      ok: false,
      error: "We could not load billing for this workspace.",
      status: 400,
    };
  }

  let stripeCustomerId = workspace.stripe_id ?? null;

  if (
    !stripeCustomerId ||
    workspace.stripe_customer_conflict ||
    (workspace.stripe_customer_creation &&
      workspace.stripe_customer_creation_completed_id !== stripeCustomerId)
  ) {
    try {
      const customer = await createStripeContact({
        workspace_id: workspaceId,
      });
      stripeCustomerId = customer.id;
    } catch {
      return {
        ok: false,
        error:
          "Billing is not ready for this workspace yet. Please try again in a moment or contact support.",
        status: 400,
      };
    }
  }

  return { ok: true, stripeCustomerId };
}

export async function getWorkspaceBilling(userId: string, workspaceId: string) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const [workspace] = await adminDb
    .select({ credits: workspaceTable.credits })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);

  if (!workspace) {
    logger.error("getWorkspaceBilling workspace error", { workspaceId });
    return {
      ok: false as const,
      error: "Workspace not found",
      status: 404,
    };
  }

  const tdb = createTenantDb(workspaceId);
  const history = await tdb.transaction_history.findMany({
    columns: LEDGER_ACTIVITY_COLUMNS,
    orderBy: (row, { desc: descFn }) => [descFn(row.created_at)],
    limit: 500,
  });

  return {
    ok: true as const,
    balance: workspace.credits ?? 0,
    transactions: history,
    pricing: billingPricing,
  };
}

export async function createBillingCheckoutSession(args: {
  userId: string;
  workspaceId: string;
  amount: number;
  requestUrl: string;
}) {
  const { userId, workspaceId, amount, requestUrl } = args;

  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
    minRole: MemberRole.Admin,
  });

  if (!Number.isFinite(amount) || amount < MIN_CREDITS) {
    return {
      ok: false as const,
      error: `Choose at least ${formatCredits(MIN_CREDITS)} credits (${formatCurrency(MIN_PURCHASE_CAD)} minimum).`,
      status: 400,
    };
  }

  const customerResult =
    checkoutProvider === "stripe"
      ? await ensureStripeCustomer(workspaceId)
      : null;
  if (customerResult && !customerResult.ok) return customerResult;

  try {
    const baseUrl = new URL(requestUrl).origin;
    const priceInCents = Math.round(amount * CREDIT_PRICE_CAD * 100);
    const metadata = { workspaceId, creditAmount: String(amount) };
    const session = await (checkoutProvider === "mock"
      ? (() => {
          const id = `mock_${crypto.randomUUID()}`;
          const record: CheckoutRecord = {
            id,
            url: `${baseUrl}/mock-checkout/${id}`,
            status: "open",
            payment_status: "unpaid",
            metadata,
          };
          localCheckoutSessions.set(id, record);
          return Promise.resolve(record);
        })()
      : createStripeClient().checkout.sessions.create({
          customer: customerResult!.stripeCustomerId,
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "cad",
                product_data: {
                  // The count is in the line name, not the quantity (#1981): the
                  // receipt then reads "12,500 workspace credits" instead of
                  // "Workspace credits × 1", and no Stripe Checkout quantity
                  // ceiling is ever hit (packages go up to 25,000 credits).
                  name: `${formatCredits(amount)} workspace credits`,
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
          metadata,
        }));

    if (!session.url || !session.id) {
      return {
        ok: false as const,
        error: "We could not open Stripe Checkout right now. Please try again.",
        status: 400,
      };
    }

    return {
      ok: true as const,
      checkout_url: session.url,
      session_id: session.id,
      pricing: billingPricing,
    };
  } catch (error) {
    logger.error("createBillingCheckoutSession error", error);
    return {
      ok: false as const,
      error: "We could not open Stripe Checkout right now. Please try again.",
      status: 400,
    };
  }
}

export type BillingSessionPollStatus =
  "open" | "complete" | "expired" | "unknown";

export async function pollBillingCheckoutSession(args: {
  userId: string;
  workspaceId: string;
  sessionId: string;
}) {
  const { userId, workspaceId, sessionId } = args;

  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
    minRole: MemberRole.Admin,
  });

  let session: Stripe.Checkout.Session;

  try {
    session = (await retrieveCheckoutSession(
      sessionId,
    )) as Stripe.Checkout.Session;
  } catch (error) {
    logger.error("pollBillingCheckoutSession retrieve error", error);
    return {
      ok: false as const,
      error: "Checkout session not found.",
      status: 404,
    };
  }

  const sessionWorkspaceId = session.metadata?.workspaceId ?? null;
  if (sessionWorkspaceId !== workspaceId) {
    return {
      ok: false as const,
      error: "Checkout session does not belong to this workspace.",
      status: 403,
    };
  }

  const creditAmount = Number(session.metadata?.creditAmount ?? 0);
  const status = (session.status ?? "unknown") as BillingSessionPollStatus;
  const paymentStatus = session.payment_status ?? "unpaid";

  if (status !== "complete" || paymentStatus !== "paid") {
    return {
      ok: true as const,
      status,
      payment_status: paymentStatus,
      confirmed: false,
      credits_added: null as number | null,
    };
  }

  if (!creditAmount) {
    return {
      ok: false as const,
      error: "Invalid session metadata.",
      status: 400,
    };
  }

  try {
    const result = await insertTransactionHistoryIdempotent(db, {
      workspaceId,
      type: "CREDIT",
      amount: creditAmount,
      note: `Added ${creditAmount} credits, stripe_session:${sessionId}`,
      idempotencyKey: stripeSessionKey(sessionId),
    });

    return {
      ok: true as const,
      status,
      payment_status: paymentStatus,
      confirmed: true,
      credits_added: creditAmount,
      inserted: result.inserted,
    };
  } catch (error) {
    logger.error("pollBillingCheckoutSession confirm error", error);
    return {
      ok: false as const,
      error:
        "We could not confirm this payment yet. If your card was charged, please contact support.",
      status: 500,
    };
  }
}

export async function confirmStripeCheckoutSessionForRedirect(args: {
  sessionId: string;
  userId?: string;
}) {
  const { sessionId } = args;
  let fallbackWorkspaceId: string | null = null;

  try {
    const session = await retrieveCheckoutSession(sessionId);

    // Capture the workspace before any throw below: it is what lets the caller
    // redirect the user back to their own billing page instead of dumping them
    // on the workspace list with a context-free error.
    const workspaceId = session.metadata?.workspaceId ?? null;
    fallbackWorkspaceId = workspaceId;

    // `status: "complete"` only means the Checkout Session finished, not that
    // money moved — it fires with payment_status "unpaid" for delayed-notification
    // methods and "no_payment_required" for zero-amount sessions. Both sibling
    // paths (pollBillingCheckoutSession, the stripe-webhook handler) check both
    // fields; this is the primary grant path and was the one missing it.
    if (session.status !== "complete" || session.payment_status !== "paid") {
      throw new Error("Payment not completed");
    }

    const creditAmount = Number(session.metadata?.creditAmount);

    if (!workspaceId || !creditAmount) {
      throw new Error("Invalid session metadata");
    }

    if (checkoutProvider === "mock") {
      if (!args.userId) throw new Error("Authentication required");
      await requireWorkspaceAccess({ user: { id: args.userId }, workspaceId });
    }

    await insertTransactionHistoryIdempotent(db, {
      workspaceId,
      type: "CREDIT",
      amount: creditAmount,
      note: `Added ${creditAmount} credits, stripe_session:${sessionId}`,
      idempotencyKey: stripeSessionKey(sessionId),
    });

    return {
      ok: true as const,
      workspaceId,
      creditAmount,
    };
  } catch (error) {
    logger.error("confirmStripeCheckoutSessionForRedirect error", error);
    return {
      ok: false as const,
      workspaceId: fallbackWorkspaceId,
      error,
    };
  }
}

/** Ledger keys and notes carry the Checkout Session id; the receipt lives on its charge or invoice. */
function stripeSessionIdForLedgerRow(row: {
  idempotency_key: string | null;
  note: string | null;
}): string | null {
  const key = row.idempotency_key ?? "";
  if (key.startsWith("stripe_session:"))
    return key.slice("stripe_session:".length) || null;
  const fromNote = /stripe_session:(cs_[A-Za-z0-9_]+)/.exec(row.note ?? "");
  return fromNote?.[1] ?? null;
}

/**
 * Resolve the Stripe-hosted receipt for one credit purchase on the ledger
 * (#1322). Workspace-scoped: the row is read through the tenant db and the
 * session's metadata must name the same workspace, so a transaction id from
 * another workspace yields 404/403, never a receipt. Failures are typed so the
 * route can answer honestly instead of a bare 500.
 */
export async function getPurchaseReceiptUrl(args: {
  userId: string;
  workspaceId: string;
  transactionId: number;
}): Promise<
  { ok: true; url: string } | { ok: false; error: string; status: number }
> {
  const { userId, workspaceId, transactionId } = args;
  await requireWorkspaceAccess({ user: { id: userId }, workspaceId });
  const tdb = createTenantDb(workspaceId);
  const row = await tdb.transaction_history.findFirst({
    where: eq(transactionHistoryTable.id, transactionId),
    columns: { id: true, type: true, idempotency_key: true, note: true },
  });
  if (!row || row.type !== "CREDIT") {
    return {
      ok: false as const,
      error: "No receipt for this entry.",
      status: 404,
    };
  }
  const sessionId = stripeSessionIdForLedgerRow(row);
  if (!sessionId) {
    return {
      ok: false as const,
      error: "No receipt for this entry.",
      status: 404,
    };
  }
  const stripe = createStripeClient();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.latest_charge", "invoice"],
    });
  } catch (error) {
    logger.error("getPurchaseReceiptUrl retrieve error", {
      workspaceId,
      transactionId,
      error,
    });
    return {
      ok: false as const,
      error: "Could not reach the payment provider.",
      status: 502,
    };
  }
  if ((session.metadata?.workspaceId ?? null) !== workspaceId) {
    return {
      ok: false as const,
      error: "Receipt does not belong to this workspace.",
      status: 403,
    };
  }
  const invoice = session.invoice;
  const hostedInvoiceUrl =
    invoice && typeof invoice !== "string"
      ? (invoice.hosted_invoice_url ?? null)
      : null;
  const paymentIntent = session.payment_intent;
  const charge =
    paymentIntent && typeof paymentIntent !== "string"
      ? paymentIntent.latest_charge
      : null;
  const receiptUrl =
    charge && typeof charge !== "string" ? (charge.receipt_url ?? null) : null;
  const url = hostedInvoiceUrl ?? receiptUrl;
  if (!url) {
    return {
      ok: false as const,
      error: "Receipt not available yet.",
      status: 404,
    };
  }
  return { ok: true as const, url };
}
