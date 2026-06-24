import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Campaign create @authenticated", () => {
  for (const [type, label] of [
    ["live_call", "Live Call"],
    ["message", "Message"],
    ["robocall", "Interactive Voice Recording"],
  ] as const) {
    ownerTest(`CAM-0${type}: create ${type} campaign`, async ({ page }) => {
      const uniqueName = `E2E New ${label} ${Date.now()}`;
      await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "campaigns/new"));
      await page.locator("#campaign-name").fill(uniqueName);
      await page.locator("#campaign-type").selectOption(type);
      await page.getByRole("button", { name: "Add Campaign" }).click();
      await expect(page).toHaveURL(/\/campaigns\/\d+\/settings/);
    });
  }

  ownerTest("CAM-04 empty title validation", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "campaigns/new"));
    await page.locator("#campaign-type").selectOption("live_call");
    await page.getByRole("button", { name: "Add Campaign" }).click();
    await expect(page).toHaveURL(/\/campaigns\/new$/);
  });
});
