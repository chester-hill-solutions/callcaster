import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Campaign create @authenticated", () => {
  for (const [type, label] of [
    ["live_call", "Live Call"],
    ["message", "Message"],
    ["robocall", "Robocall"],
  ] as const) {
    ownerTest(`CAM-0${type}: create ${type} campaign`, async ({ page }) => {
      await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "campaigns/new"));
      await page.getByLabel(/title|name/i).fill(`E2E New ${label}`);
      await page.getByRole("radio", { name: new RegExp(label, "i") }).check();
      await page.getByRole("button", { name: /create|save/i }).click();
      await expect(page).toHaveURL(/\/campaigns\/\d+/);
    });
  }

  ownerTest("CAM-04 empty title validation", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "campaigns/new"));
    await page.getByRole("button", { name: /create|save/i }).click();
    await expect(page.getByText(/required|enter|title/i).first()).toBeVisible();
  });
});
