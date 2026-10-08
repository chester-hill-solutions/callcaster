/**
 * A counting semaphore for bounding concurrent work.
 *
 * `postgres.js` queues queries past the pool ceiling rather than failing them,
 * which hides the cost of over-fanning until it shows up as latency in
 * unrelated request paths. A semaphore makes the bound explicit and lets the
 * caller choose where to apply it.
 *
 * Callers must release in a `finally`, or the permit leaks and the bound
 * tightens until every later caller waits forever.
 */
export type Semaphore = {
  /** Resolves with a release function. Run it exactly once. */
  acquire: () => Promise<() => void>;
  /** Permits currently held. */
  readonly inFlight: number;
  /** Callers waiting for a permit. */
  readonly waiting: number;
};

export function createSemaphore(maxConcurrent: number): Semaphore {
  const limit = Math.max(1, Math.floor(maxConcurrent));
  let held = 0;
  const queue: Array<() => void> = [];

  const release = () => {
    const next = queue.shift();
    if (next) {
      // Hand the permit straight to the next waiter. `held` must not move:
      // one holder leaves and one arrives, so the count is unchanged. If it
      // dropped here the semaphore would undercount and admit a caller past
      // the limit the moment the queue drained.
      next();
      return;
    }
    held -= 1;
  };

  return {
    async acquire() {
      if (held < limit) {
        held += 1;
        return release;
      }
      return new Promise<() => void>((resolve) => {
        queue.push(() => {
          resolve(release);
        });
      });
    },
    get inFlight() {
      return held;
    },
    get waiting() {
      return queue.length;
    },
  };
}
