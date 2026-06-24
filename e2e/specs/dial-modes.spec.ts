import { ownerTest, expect } from "../fixtures/test-base";
import { CallScreenPage } from "../pages/CallScreenPage";
import { E2E_CAMPAIGNS, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";
import { setWorkspaceCredits } from "../fixtures/factories";

ownerTest.describe("Dial modes @authenticated @slow", () => {
  ownerTest("DIAL-01 predictive toggle in settings", async ({ page }) => {
    await page.goto(
      workspacePath(
        E2E_WORKSPACES.ready.id,
        `campaigns/${E2E_CAMPAIGNS.livePredictive.id}/settings`,
      ),
    );
    await expect(page.getByText("Dial Type:")).toBeVisible();
    await expect(page.locator("#dial_type")).toBeVisible();
  });

  ownerTest("DIAL-02 standard call screen", async ({ page }) => {
    const callScreen = new CallScreenPage(page);
    await callScreen.goto(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.liveCall.id);
    await expect(callScreen.dialButton()).toBeVisible();
  });

  ownerTest("DIAL-03 predictive call screen", async ({ page }) => {
    const callScreen = new CallScreenPage(page);
    await callScreen.goto(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.livePredictive.id);
    await expect(callScreen.dialButton()).toBeVisible();
  });

  ownerTest("DIAL-08 zero credits owner billing link", async ({ page }) => {
    await setWorkspaceCredits(E2E_WORKSPACES.ready.id, 0);
    const callScreen = new CallScreenPage(page);
    await callScreen.goto(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.liveCall.id);
    await expect(page.getByText(/No Credits Remaining|Purchase Credits/i).first()).toBeVisible();
    await setWorkspaceCredits(E2E_WORKSPACES.ready.id, 500);
  });
});
