import { test, sudoTest, expect } from "../fixtures/test-base";
import { AdminPage } from "../pages/AdminPage";
import { E2E_WORKSPACES } from "../fixtures/seed";

test.describe("Admin portal @sudo", () => {
  test("ADM-01 non-sudo blocked", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/signin/);
  });

  sudoTest("ADM-02 sudo dashboard", async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await expect(page.getByText(/admin|workspace|user|campaign/i).first()).toBeVisible();
  });

  sudoTest("ADM-04 twilio portal", async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto(`/admin/workspaces/${E2E_WORKSPACES.ready.id}/twilio`);
    await expect(page.getByText(/twilio|health|number|billing/i).first()).toBeVisible();
  });
});
