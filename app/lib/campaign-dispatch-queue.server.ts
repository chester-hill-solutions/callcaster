import { normalizePhoneNumber } from "@/lib/utils";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import { rpcFailExhaustedCampaignQueueContacts, type RpcExecutor } from "@/lib/db-rpc.server";

type QueueMemberWithContact = {
  contact?: { phone?: string | null } | null;
};

/**
 * Select the first currently eligible recipients without letting quiet-hours
 * rows consume the dispatch cap. Deferred rows remain queued for a later tick.
 */
export function selectEligibleCampaignQueueMembers<T extends QueueMemberWithContact>(
  members: T[],
  limit?: number,
): { selected: T[]; deferredCount: number; unselectedEligibleCount: number } {
  const normalizedLimit = limit === undefined ? undefined : Math.max(0, Math.floor(limit));
  const selected: T[] = [];
  let deferredCount = 0;
  let unselectedEligibleCount = 0;

  for (const member of members) {
    const phone = normalizePhoneNumber(member.contact?.phone ?? "");
    if (!recipientCallingWindowStatus(phone).allowed) {
      deferredCount += 1;
      continue;
    }

    if (normalizedLimit === undefined || selected.length < normalizedLimit) {
      selected.push(member);
    } else {
      unselectedEligibleCount += 1;
    }
  }

  return { selected, deferredCount, unselectedEligibleCount };
}

/**
 * A promise the batch can await for one phone number's first outcome, so
 * sibling rows sharing that number wait on a single provider call instead of
 * racing each other to it.
 *
 * Generic over the result: the SMS and IVR dispatchers each had this factory,
 * byte-identical apart from the result type they parameterised it with.
 */
export type PhoneClaim<T> = {
  result: Promise<T>;
  resolve: (result: T) => void;
};

export function createPhoneClaim<T>(): PhoneClaim<T> {
  let resolve!: (result: T) => void;
  const result = new Promise<T>((resolveResult) => {
    resolve = resolveResult;
  });
  return { result, resolve };
}

/**
 * Dead-letter rows that failed for the last time, so one bad number cannot pin
 * the chain to retries forever (#1513). Returns how many rows it dead-lettered,
 * which the caller reports as the batch's `exhausted` count.
 *
 * Both dispatchers run this the moment any row has failed, and they were two
 * copies of the same rule. The guard is the point of sharing it rather than
 * repeating it: the sweep is a database write, so running it on a batch where
 * nothing failed pays for nothing.
 */
export async function sweepExhaustedQueueContacts(
  executor: RpcExecutor,
  campaignId: string,
  failedCount: number,
): Promise<number> {
  if (failedCount <= 0) return 0;
  return rpcFailExhaustedCampaignQueueContacts(executor, Number(campaignId));
}
