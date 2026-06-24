import { ownerTest, expect } from "../fixtures/test-base";
import { expectCreditsBadgeUpdate } from "../fixtures/realtime";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Realtime @realtime @slow", () => {
  ownerTest("RT-01 credits badge update", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id));
    await expectCreditsBadgeUpdate(page, E2E_WORKSPACES.ready.id, 777);
    await expect(page.getByText("777").first()).toBeVisible();
  });
});
