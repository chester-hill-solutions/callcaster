import { normalizePhoneNumber } from "@/lib/utils";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";

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
