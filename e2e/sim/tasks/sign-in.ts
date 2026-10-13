import { expect, type Page } from "@playwright/test";

export async function signInForSim(
  page: Page,
  sender: { email: string; password: string },
): Promise<void> {
  await page.goto("/signin");
  await page.locator("#email").fill(sender.email);
  await page.locator("#password").fill(sender.password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/workspaces/);
}
