export type BillingReconcileRequest = {
  workspaceId: string | null;
  limit: number;
  concurrency: number;
};

export function parseBillingReconcileBody(raw: unknown): BillingReconcileRequest {
  const defaults: BillingReconcileRequest = {
    workspaceId: null,
    limit: 100,
    concurrency: 8,
  };
  if (raw == null || typeof raw !== "object") return defaults;
  const body = raw as Record<string, unknown>;
  const cap = (value: unknown, max: number, fallback: number) => {
    const parsed =
      typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(Math.floor(parsed), max);
  };
  const workspaceId =
    typeof body.workspaceId === "string" && body.workspaceId.trim()
      ? body.workspaceId.trim()
      : null;
  return {
    workspaceId,
    limit: cap(body.limit, 200, defaults.limit),
    concurrency: cap(body.concurrency, 20, defaults.concurrency),
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const batchSize = Math.max(1, concurrency);
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map(mapper));
    results.push(...batchResults);
  }
  return results;
}
