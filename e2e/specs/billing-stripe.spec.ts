import { ownerTest, expect } from "../fixtures/test-base";
import { BillingPage } from "../pages/BillingPage";
import { E2E_WORKSPACES } from "../fixtures/seed";

ownerTest.describe("Billing @authenticated", () => {
  ownerTest("PAY-03 billing page shows credits", async ({ page }) => {
    const billing = new BillingPage(page);
    await billing.goto(E2E_WORKSPACES.ready.id);
    await expect(page.getByText(/credit|balance|500/i).first()).toBeVisible();
  });

  ownerTest("PAY-08 below minimum validation", async ({ page }) => {
    const billing = new BillingPage(page);
    await billing.goto(E2E_WORKSPACES.ready.id);
    const custom = page.getByLabel(/custom|amount/i);
    if (await custom.isVisible()) {
      await custom.fill("1");
      await page.getByRole("button", { name: /purchase|checkout|buy/i }).click();
      await expect(page.getByText(/minimum|at least/i).first()).toBeVisible();
    }
  });

  ownerTest("PAY-03 success banner query param", async ({ page }) => {
    const billing = new BillingPage(page);
    await billing.goto(
      E2E_WORKSPACES.ready.id,
      "?payment_status=success&credits_added=100",
    );
    await expect(page.getByText(/success|added|100/i).first()).toBeVisible();
  });
});
