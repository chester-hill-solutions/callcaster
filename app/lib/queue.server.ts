import {
  rpcHandleCampaignQueueEntry,
  rpcReserveCampaignQueueOrderRange,
} from "@/lib/db-rpc.server";
import { db } from "@/server/db";

const BATCH_SIZE = 100;
const RPC_CONCURRENCY = 10;

function parseFiniteNumber(
  value: number | string | undefined,
): number | undefined {
  const parsedValue =
    typeof value === "string" ? Number.parseInt(value, 10) : value;
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Enqueue contacts for a campaign using the unified handle_campaign_queue_entry RPC.
 * Handles deduplication, ordering, and requeue semantics consistently.
 */
export async function enqueueContactsForCampaign(
  campaignId: number,
  contactIds: number[],
  options?: { startOrder?: number | string; requeue?: boolean },
) {
  if (contactIds.length === 0) return;

  const requeue = options?.requeue ?? false;
  let startOrder = parseFiniteNumber(options?.startOrder);

  if (startOrder === undefined) {
    startOrder = await rpcReserveCampaignQueueOrderRange(db, {
      campaignId,
      count: contactIds.length,
    });
  }
  const resolvedStartOrder = startOrder as number;
  const enqueueErrors: Error[] = [];

  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    const indexedBatch = batch.map((contactId, indexInBatch) => ({
      contactId,
      indexInBatch,
    }));

    for (const group of chunkArray(indexedBatch, RPC_CONCURRENCY)) {
      const groupResults = await Promise.allSettled(
        group.map(async ({ contactId, indexInBatch }) => {
          const queueOrder = resolvedStartOrder + i + indexInBatch;
          try {
            await rpcHandleCampaignQueueEntry(db, {
              contactId,
              campaignId,
              queueOrder,
              requeue,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new Error(
              `Failed to enqueue contact ${contactId} for campaign ${campaignId}: ${message}`,
            );
          }
        }),
      );

      for (const result of groupResults) {
        if (result.status === "rejected") {
          enqueueErrors.push(
            result.reason instanceof Error
              ? result.reason
              : new Error(String(result.reason)),
          );
        }
      }
    }
  }

  if (enqueueErrors.length > 0) {
    throw new AggregateError(
      enqueueErrors,
      `Failed to enqueue ${enqueueErrors.length} contact(s) for campaign ${campaignId}`,
    );
  }
}
