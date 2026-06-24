import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_CAMPAIGNS, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("IVR script editor @authenticated", () => {
  ownerTest("IVR-01 robocall script editor loads", async ({ page }) => {
    await page.goto(
      workspacePath(
        E2E_WORKSPACES.ready.id,
        `campaigns/${E2E_CAMPAIGNS.robocall.id}/script/edit`,
      ),
    );
    await expect(page.getByText(/script|ivr|block|page/i).first()).toBeVisible();
  });

  ownerTest("IVR-07 robocall readiness in settings", async ({ page }) => {
    await page.goto(
      workspacePath(
        E2E_WORKSPACES.ready.id,
        `campaigns/${E2E_CAMPAIGNS.robocall.id}/settings`,
      ),
    );
    await expect(page.getByTestId("campaign-readiness")).toBeVisible();
  });
});
