import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest("CAM-09 archived campaigns list", async ({ page }) => {
  await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "campaigns/archive"));
  await expect(page.getByText(/E2E Archived Campaign|archived/i).first()).toBeVisible();
});
