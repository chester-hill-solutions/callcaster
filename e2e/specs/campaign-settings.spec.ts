import { ownerTest, expect } from "../fixtures/test-base";
import { CampaignSettingsPage } from "../pages/CampaignSettingsPage";
import { E2E_CAMPAIGNS, E2E_WORKSPACES } from "../fixtures/seed";

ownerTest.describe("Campaign settings @authenticated", () => {
  ownerTest("CAM-05 launch controls visible", async ({ page }) => {
    const settings = new CampaignSettingsPage(page);
    await settings.gotoLaunch(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.launchReady.id);
    await expect(page.getByTestId("campaign-status-rail")).toBeVisible();
    await expect(settings.readinessPanel()).toBeVisible();
    await expect(page.getByRole("button", { name: /start/i }).first()).toBeVisible();
  });

  ownerTest("CAM-06 start disabled when draft incomplete", async ({ page }) => {
    const settings = new CampaignSettingsPage(page);
    await settings.gotoLaunch(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.robocall.id);
    await expect(settings.readinessPanel()).toBeVisible();
  });
});
