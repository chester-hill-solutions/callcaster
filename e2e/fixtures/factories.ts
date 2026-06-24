import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

let serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (serviceClient) {
    return serviceClient;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY required for E2E factories");
  }
  serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return serviceClient;
}

export async function setWorkspaceCredits(workspaceId: string, credits: number): Promise<void> {
  const client = getServiceClient();
  const { error } = await client.from("workspace").update({ credits }).eq("id", workspaceId);
  if (error) {
    throw error;
  }
}

export async function insertInboundMessage(params: {
  workspaceId: string;
  contactId: number;
  from: string;
  to: string;
  body: string;
}): Promise<void> {
  const client = getServiceClient();
  const { error } = await client.from("message").insert({
    sid: `SM_e2e_rt_${Date.now()}`,
    workspace: params.workspaceId,
    contact_id: params.contactId,
    body: params.body,
    direction: "inbound",
    from: params.from,
    to: params.to,
    status: "received",
    date_created: new Date().toISOString(),
  });
  if (error) {
    throw error;
  }
}

export async function clearCampaignQueue(campaignId: number): Promise<void> {
  const client = getServiceClient();
  const { error } = await client.from("campaign_queue").delete().eq("campaign_id", campaignId);
  if (error) {
    throw error;
  }
}

export async function expectTextPoll(
  page: Page,
  locatorText: RegExp | string,
  options?: { timeout?: number },
): Promise<void> {
  await expect.poll(async () => page.getByText(locatorText).count(), {
    timeout: options?.timeout ?? 10_000,
  }).toBeGreaterThan(0);
}

export type ReadinessGap =
  | "queue_empty"
  | "script_required"
  | "outbound_number_required";

export async function setCampaignReadinessGap(
  campaignId: number,
  gap: ReadinessGap,
): Promise<void> {
  const client = getServiceClient();
  switch (gap) {
    case "queue_empty":
      await client.from("campaign_queue").delete().eq("campaign_id", campaignId);
      return;
    case "outbound_number_required":
      await client.from("campaign").update({ caller_id: null }).eq("id", campaignId);
      return;
    case "script_required":
      await client.from("live_campaign").update({ script_id: null }).eq("campaign_id", campaignId);
      return;
    default: {
      const _exhaustive: never = gap;
      throw new Error(`Unhandled gap: ${_exhaustive}`);
    }
  }
}

export async function createPendingInvite(params: {
  workspaceId: string;
  userId: string;
  role?: string;
}): Promise<void> {
  const client = getServiceClient();
  const { error } = await client.from("workspace_invite").upsert({
    id: `d1000000-0000-4000-8000-${Date.now().toString().slice(-12)}`,
    workspace: params.workspaceId,
    user_id: params.userId,
    role: params.role ?? "member",
    isNew: true,
  });
  if (error) {
    throw error;
  }
}
