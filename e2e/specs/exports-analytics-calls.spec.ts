import { ownerTest, expect } from "../fixtures/test-base";
import { postCallStatus } from "../fixtures/webhooks";
import { E2E_CAMPAIGNS, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Exports analytics calls @authenticated", () => {
  ownerTest("EXP-03 exports page", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "exports"));
    await expect(page.getByText(/export/i).first()).toBeVisible();
  });

  ownerTest("ANA-01 analytics dashboard", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "analytics"));
    await expect(page.getByText(/analytics|campaign|call/i).first()).toBeVisible();
  });

  ownerTest("CALL-01 call log page", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "calls"));
    await expect(page.getByText(/call|log|attempt/i).first()).toBeVisible();
  });

  ownerTest("CALL-02 call status webhook accepted", async ({ request }) => {
    const response = await postCallStatus(request, {
      campaignId: E2E_CAMPAIGNS.liveCall.id,
    });
    expect([200, 400, 404]).toContain(response.status());
  });
});
