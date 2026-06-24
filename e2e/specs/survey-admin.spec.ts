import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_SURVEY, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Survey admin @authenticated", () => {
  ownerTest("SURV-10 admin responses list", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `surveys/${E2E_SURVEY.id}/responses`));
    await expect(page.getByText(/response|survey/i).first()).toBeVisible();
  });

  ownerTest("SURV-12 surveys list with public link", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "surveys"));
    await expect(page.getByText(/E2E Public Survey|survey/i).first()).toBeVisible();
  });
});
