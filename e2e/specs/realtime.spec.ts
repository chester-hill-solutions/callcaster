import { ownerTest, expect } from "../fixtures/test-base";
import { setWorkspaceCredits } from "../fixtures/factories";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Realtime @realtime @slow", () => {
  ownerTest("RT-01 credits badge update", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "billing"));
    await expect(page.getByText("500").first()).toBeVisible();
    await setWorkspaceCredits(E2E_WORKSPACES.ready.id, 777);
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByText("777").count();
      }, { timeout: 20_000 })
      .toBeGreaterThan(0);
    await setWorkspaceCredits(E2E_WORKSPACES.ready.id, 500);
  });
});
