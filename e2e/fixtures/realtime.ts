import type { Page } from "@playwright/test";
import { setWorkspaceCredits, expectTextPoll } from "./factories";

export async function expectCreditsBadgeUpdate(
  page: Page,
  workspaceId: string,
  expectedCredits: number,
): Promise<void> {
  await setWorkspaceCredits(workspaceId, expectedCredits);
  await expectTextPoll(page, String(expectedCredits), { timeout: 15_000 });
}

export { setWorkspaceCredits, insertInboundMessage, clearCampaignQueue } from "./factories";
