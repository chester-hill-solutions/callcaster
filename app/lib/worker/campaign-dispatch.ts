import { DISPATCH_TICK_MS } from "@/lib/throughput-config";

export type CampaignDispatchDb = {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

export async function scheduleNextDispatch(args: {
  fetchImpl: typeof fetch;
  queueNextUrl: string;
  headers: Record<string, string>;
  campaignId: number;
  owner: string | null;
  delayMs?: number;
}): Promise<void> {
  const delayMs = args.delayMs ?? DISPATCH_TICK_MS;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await args.fetchImpl(args.queueNextUrl, {
    method: "POST",
    headers: args.headers,
    body: JSON.stringify({
      campaign_id: args.campaignId,
      owner: args.owner,
    }),
  }).catch((error) => {
    console.error("Failed to schedule next queue-next dispatch", {
      campaignId: args.campaignId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
