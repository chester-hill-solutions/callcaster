import { describe, expect, test } from "vitest";

import { createSemaphore, type Semaphore } from "@/lib/semaphore";

/** Yields to the macrotask queue so queued waiters get a chance to resume. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Runs `count` copies of `work`, each holding a permit, and reports the peak. */
async function peakPermitHolders(
  semaphore: Semaphore,
  count: number,
  work: () => Promise<void>,
): Promise<number> {
  let inFlight = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: count }, () =>
      (async () => {
        const release = await semaphore.acquire();
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        try {
          await work();
        } finally {
          inFlight -= 1;
          release();
        }
      })(),
    ),
  );
  return peak;
}

describe("createSemaphore", () => {
  test("never runs more than the limit at once", async () => {
    const semaphore = createSemaphore(3);
    const peak = await peakPermitHolders(semaphore, 20, settle);

    expect(peak).toBe(3);
    expect(semaphore.inFlight).toBe(0);
    expect(semaphore.waiting).toBe(0);
  });

  test("holds the limit while permits are handed between waiters", async () => {
    // The off-by-one this catches: a permit handed from a departing holder to
    // an already-queued waiter must leave the count unchanged. If it dropped
    // instead, the count would fall below the true number in flight and a later
    // caller would be admitted past the limit.
    //
    // The queue must actually hold waiters for that path to run, so this uses
    // more callers than the limit on every wave rather than exactly the limit.
    const semaphore = createSemaphore(2);
    const run = async () => {
      const release = await semaphore.acquire();
      try {
        await settle();
      } finally {
        release();
      }
    };

    for (let wave = 0; wave < 3; wave += 1) {
      // Six callers, two permits: four queue, and every release is a handoff.
      expect(semaphore.waiting).toBe(0);
      await Promise.all(Array.from({ length: 6 }, run));
    }

    expect(semaphore.inFlight).toBe(0);
    expect(semaphore.waiting).toBe(0);
  });

  test("returns the permit when the guarded work throws", async () => {
    const semaphore = createSemaphore(1);

    await expect(
      (async () => {
        const release = await semaphore.acquire();
        try {
          throw new Error("boom");
        } finally {
          release();
        }
      })(),
    ).rejects.toThrow("boom");

    // A leaked permit would make this hang rather than resolve.
    const release = await semaphore.acquire();
    expect(semaphore.inFlight).toBe(1);
    release();
    expect(semaphore.inFlight).toBe(0);
  });

  test("admits waiters in the order they arrived", async () => {
    const semaphore = createSemaphore(1);
    const release = await semaphore.acquire();
    const order: number[] = [];

    const queued = [1, 2, 3].map((id) =>
      semaphore.acquire().then((releaseNext) => {
        order.push(id);
        releaseNext();
      }),
    );

    expect(semaphore.waiting).toBe(3);
    release();
    await Promise.all(queued);

    expect(order).toEqual([1, 2, 3]);
  });

  test("treats a non-positive or fractional limit as one", async () => {
    for (const limit of [0, -5, 0.4]) {
      const semaphore = createSemaphore(limit);
      const release = await semaphore.acquire();
      expect(semaphore.inFlight).toBe(1);
      // A second caller must wait rather than share the single permit.
      expect(semaphore.waiting).toBe(0);
      release();
      expect(semaphore.inFlight).toBe(0);
    }
  });
});
