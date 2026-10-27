import { expect, type Page } from "@playwright/test";

/** Finish the product's local mock checkout UI. The app owns session creation and confirmation. */
export async function completeLocalCheckout(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Local test checkout" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Complete local test payment" })
    .click();
  await expect(page).toHaveURL(/\/workspaces\/[^/]+\/billing\?/);
}
