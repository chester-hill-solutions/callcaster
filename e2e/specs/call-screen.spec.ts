import { ownerTest, expect } from "../fixtures/test-base";
import { CallScreenPage } from "../pages/CallScreenPage";
import { E2E_CAMPAIGNS, E2E_WORKSPACES } from "../fixtures/seed";
import { setWorkspaceCredits } from "../fixtures/factories";

ownerTest.describe("Call screen @authenticated", () => {
  ownerTest.beforeEach(async () => {
    await setWorkspaceCredits(E2E_WORKSPACES.ready.id, 500);
  });

  ownerTest("DIAL-09 call screen loads with mocked device", async ({ page }) => {
    const callScreen = new CallScreenPage(page);
    await callScreen.goto(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.liveCall.id);
    await expect(callScreen.dialButton()).toBeVisible();
  });
});
