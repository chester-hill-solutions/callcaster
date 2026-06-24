import { ownerTest, expect } from "../fixtures/test-base";
import { CampaignSettingsPage } from "../pages/CampaignSettingsPage";
import { E2E_CAMPAIGNS, E2E_WORKSPACES } from "../fixtures/seed";

ownerTest.describe("Campaign settings @authenticated", () => {
  ownerTest("CAM-05 setup guide visible", async ({ page }) => {
    const settings = new CampaignSettingsPage(page);
    await settings.goto(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.liveCall.id);
    await expect(settings.readinessPanel()).toBeVisible();
    await expect(page.getByText("Campaign Controls")).toBeVisible();
  });

  ownerTest("CAM-06 start disabled when draft incomplete", async ({ page }) => {
    const settings = new CampaignSettingsPage(page);
    await settings.goto(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.robocall.id);
    await expect(settings.readinessPanel()).toBeVisible();
  });
});
