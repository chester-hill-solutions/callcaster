import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_CAMPAIGNS, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Campaign queue @authenticated", () => {
  ownerTest("CAM-10 queue lists seeded rows", async ({ page }) => {
    await page.goto(
      workspacePath(E2E_WORKSPACES.ready.id, `campaigns/${E2E_CAMPAIGNS.liveCall.id}/queue`),
    );
    await expect(page.getByTestId("campaign-queue-table")).toBeVisible();
    await expect(page.getByText(/Contact/i).first()).toBeVisible();
  });
});
