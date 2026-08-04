import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { adminDb } from "@/server/admin-db";
import {
  campaign as campaignTable,
  campaign_queue as campaignQueueTable,
  message as messageTable,
  workspace as workspaceTable,
  workspace_events as workspaceEventsTable,
  workspace_invite as workspaceInviteTable,
} from "@/db/schema";

export function getServiceClient() {
  return adminDb;
}

/**
 * Append a workspace event, the way a real row change does via
 * `insertWorkspaceEvent`, and return its id.
 *
 * Written directly rather than through a mutation helper because most test
 * mutations (setWorkspaceCredits among them) write to the database without
 * emitting anything — so they can never exercise the SSE path.
 */
export async function appendWorkspaceEvent(
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const [row] = await adminDb
    .insert(workspaceEventsTable)
    .values({
      workspace_id: workspaceId,
      event_type: "postgres_change",
      payload,
      created_at: new Date().toISOString(),
    })
    .returning({ id: workspaceEventsTable.id });
  if (!row) throw new Error("Failed to append workspace event");
  return row.id;
}

export async function setWorkspaceCredits(workspaceId: string, credits: number): Promise<void> {
  const result = await adminDb
    .update(workspaceTable)
    .set({ credits })
    .where(eq(workspaceTable.id, workspaceId))
    .returning({ credits: workspaceTable.credits });
  if (result.length === 0) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  if (result[0]?.credits !== credits) {
    throw new Error(
      `Workspace ${workspaceId} credits expected ${credits}, got ${result[0]?.credits}`,
    );
  }
}

export async function insertInboundMessage(params: {
  workspaceId: string;
  contactId: number;
  from: string;
  to: string;
  body: string;
}): Promise<void> {
  await adminDb.insert(messageTable).values({
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
}

export async function clearCampaignQueue(campaignId: number): Promise<void> {
  await adminDb
    .delete(campaignQueueTable)
    .where(eq(campaignQueueTable.campaign_id, campaignId));
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
  switch (gap) {
    case "queue_empty":
      await adminDb
        .delete(campaignQueueTable)
        .where(eq(campaignQueueTable.campaign_id, campaignId));
      return;
    case "outbound_number_required":
      await adminDb
        .update(campaignTable)
        .set({ caller_id: null })
        .where(eq(campaignTable.id, campaignId));
      return;
    case "script_required":
      await adminDb
        .update(campaignTable)
        .set({ script_id: null })
        .where(eq(campaignTable.id, campaignId));
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
  await adminDb
    .insert(workspaceInviteTable)
    .values({
      id: `d1000000-0000-4000-8000-${Date.now().toString().slice(-12)}`,
      workspace: params.workspaceId,
      user_id: params.userId,
      role: params.role ?? "member",
      isNew: true,
      created_at: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: workspaceInviteTable.id,
      set: {
        workspace: params.workspaceId,
        user_id: params.userId,
        role: params.role ?? "member",
        isNew: true,
      },
    });
}
