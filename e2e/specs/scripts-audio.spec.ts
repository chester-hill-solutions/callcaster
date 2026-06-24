import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_SCRIPT, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Scripts and audio @authenticated", () => {
  ownerTest("SCR-01 scripts list", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "scripts"));
    await expect(page.getByText(/E2E Live Script|script/i).first()).toBeVisible();
  });

  ownerTest("SCR-02 edit script", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `scripts/${E2E_SCRIPT.id}`));
    await expect(page.getByText(/script|block|intro/i).first()).toBeVisible();
  });

  ownerTest("AUD-06 audios list", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "audios"));
    await expect(page.getByText(/audio|upload/i).first()).toBeVisible();
  });
});
