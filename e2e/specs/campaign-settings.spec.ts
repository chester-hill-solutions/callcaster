import { ownerTest, expect } from "../fixtures/test-base";
import { CampaignSettingsPage } from "../pages/CampaignSettingsPage";
import { E2E_CAMPAIGNS, E2E_WORKSPACES } from "../fixtures/seed";

ownerTest.describe("Campaign settings @authenticated", () => {
  ownerTest("CAM-05 setup guide visible", async ({ page }) => {
    const settings = new CampaignSettingsPage(page);
    await settings.goto(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.liveCall.id);
    await expect(page.getByText(/setup|readiness|schedule|phone/i).first()).toBeVisible();
    await expect(settings.readinessPanel()).toBeVisible();
  });

  ownerTest("CAM-06 start disabled when draft incomplete", async ({ page }) => {
    const settings = new CampaignSettingsPage(page);
    await settings.goto(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.robocall.id);
    const start = page.getByRole("button", { name: /^start$/i }).first();
    if (await start.isVisible()) {
      await expect(start).toBeDisabled();
    }
  });
});
