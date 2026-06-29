import type { QueueItem, OutreachAttempt, Call } from "./types";

export const sortQueue = (queue: QueueItem[]): QueueItem[] => {
  return [...queue].sort((a, b) => {
    if (a.attempts !== b.attempts) {
      return b.attempts - a.attempts;
    }
    if (a.id !== b.id) {
      return a.id - b.id;
    }
    return (a.queue_order ?? 0) - (b.queue_order ?? 0);
  });
};

export const createHouseholdMap = (
  queue: QueueItem[],
): Record<string, QueueItem[]> => {
  return queue.reduce<Record<string, QueueItem[]>>((acc, curr, index) => {
    if (curr?.contact?.address) {
      const address = curr.contact.address;
      if (!acc[address]) {
        acc[address] = [];
      }
      acc[address]?.push(curr);
    } else {
      acc[`NO_ADDRESS_${index}`] = [curr];
    }
    return acc;
  }, {});
};

export const updateAttemptWithCall = (
  attempt: OutreachAttempt,
  call: Call | null,
): OutreachAttempt => {
  const resultData =
    attempt.result && typeof attempt.result === "object" && !Array.isArray(attempt.result)
      ? attempt.result
      : {};

  return {
    ...attempt,
    result: {
      ...resultData,
      ...(call &&
        call.status &&
        call.direction !== "outbound-api" && { status: call.status }),
    },
  };
};
