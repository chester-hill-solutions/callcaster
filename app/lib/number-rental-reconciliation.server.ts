import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import {
  transaction_history,
  workspace_number,
  workspace_number_purchase,
  workspace_number_release,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { logger } from "@/lib/logger.server";
import { numberRentalReconciliationPeriod } from "../../shared/number-rental-cycle";
import type {
  NumberRentalHistory,
  NumberRentalReconciliationInput,
} from "../../shared/number-rental-reconciliation";

export async function loadNumberRentalReconciliationInput(args: {
  workspaceId: string;
  referenceDate: Date;
}): Promise<NumberRentalReconciliationInput> {
  const period = numberRentalReconciliationPeriod(args.referenceDate);
  const month = period.startDate.slice(0, 7);
  const tdb = createTenantDb(args.workspaceId);
  const twilio = await createWorkspaceTwilioInstance({
    workspace_id: args.workspaceId,
  });
  let coverageIssue: string | undefined;
  const [records, ledgerRows, numbers, releases, purchases] = await Promise.all(
    [
      withTwilioRetry(
        () =>
          twilio.usage.records.list({
            startDate: new Date(period.startDate),
            endDate: new Date(period.endDate),
            includeSubaccounts: false,
          }),
        {
          workspaceId: args.workspaceId,
          operation: "billing_reconcile_rental_usage",
        },
      ).catch(() => {
        coverageIssue = "Rental usage could not be loaded for this period.";
        logger.warn("billing_reconcile.rental_usage_unavailable", {
          workspaceId: args.workspaceId,
          period,
        });
        return [];
      }),
      tdb.transaction_history.findMany({
        where: and(
          sql`trim(${transaction_history.idempotency_key}) ~ '^number_rent:'`,
          lte(transaction_history.created_at, args.referenceDate.toISOString()),
          or(
            sql`trim(${transaction_history.idempotency_key}) ~ ${`^number_rent:.*:${month}$`}`,
            and(
              gte(
                transaction_history.created_at,
                `${period.startDate}T00:00:00.000Z`,
              ),
              lte(
                transaction_history.created_at,
                `${period.endDate}T23:59:59.999Z`,
              ),
            ),
          ),
        ),
        columns: {
          type: true,
          amount: true,
          idempotency_key: true,
          created_at: true,
        },
      }),
      tdb.workspace_number.findMany({
        where: eq(workspace_number.type, "rented"),
        columns: { id: true, created_at: true, twilio_phone_number_sid: true },
      }),
      tdb.workspace_number_release.findMany({
        where: eq(workspace_number_release.number_type, "rented"),
        columns: {
          number_id: true,
          number_created_at: true,
          provider_sid: true,
          account_sid: true,
          state: true,
          created_at: true,
          updated_at: true,
        },
      }),
      tdb.workspace_number_purchase.findMany({
        where: eq(workspace_number_purchase.state, "completed"),
        columns: { provider_sid: true, account_sid: true },
      }),
    ],
  );
  const history = new Map<number, NumberRentalHistory>();
  for (const number of numbers) {
    if (!/^PN[0-9a-f]{32}$/i.test(number.twilio_phone_number_sid ?? ""))
      coverageIssue = "An active rental has no provider identity.";
    if (
      purchases.some(
        (purchase) =>
          purchase.provider_sid === number.twilio_phone_number_sid &&
          purchase.account_sid !== twilio.accountSid,
      )
    ) {
      coverageIssue =
        "An active rental was purchased under another provider account.";
    }
    history.set(number.id, { id: number.id, createdAt: number.created_at });
  }
  for (const release of releases) {
    if (release.account_sid !== twilio.accountSid) {
      // A release from an old provider account cannot offset this account's
      // usage. A matching active ID is ambiguous after an account change.
      if (history.has(release.number_id))
        coverageIssue =
          "An active rental and its release have different provider accounts.";
      continue;
    }
    const active = numbers.find((number) => number.id === release.number_id);
    if (
      active &&
      (active.created_at !== release.number_created_at ||
        active.twilio_phone_number_sid !== release.provider_sid)
    ) {
      coverageIssue =
        "An active rental and its release have different identities.";
    }
    history.set(release.number_id, {
      id: release.number_id,
      createdAt: release.number_created_at,
      releaseStartedAt: release.created_at.toISOString(),
      releaseCompletedAt:
        release.state === "released" || release.state === "completed"
          ? release.updated_at.toISOString()
          : undefined,
    });
  }
  if (
    records.some(
      (record) => record.accountSid && record.accountSid !== twilio.accountSid,
    )
  ) {
    coverageIssue = "Rental usage belongs to another provider account.";
  }
  return {
    period,
    ledgerRows,
    history: [...history.values()],
    coverageIssue,
    twilioUsage: records.map((record) => ({
      category: record.category,
      description: record.description,
      usage: record.usage,
      usageUnit: record.usageUnit,
      price: record.price.toString(),
      startDate: record.startDate?.toISOString(),
      endDate: record.endDate?.toISOString(),
    })),
  };
}
