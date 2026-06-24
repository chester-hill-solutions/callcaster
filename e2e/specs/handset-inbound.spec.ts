import { ownerTest, expect } from "../fixtures/test-base";
import { enableTwilioMocks } from "../fixtures/twilio-mocks";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Handset inbound @authenticated", () => {
  ownerTest("HND-01 handset page loads", async ({ page }) => {
    await enableTwilioMocks(page);
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "handset"));
    await expect(page.getByText(/handset|agent|desktop|queue/i).first()).toBeVisible();
  });

  ownerTest("HND-03 queue settings", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "settings/queues"));
    await expect(page.getByText(/queue|preset|routing/i).first()).toBeVisible();
  });
});
