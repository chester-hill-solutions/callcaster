import { expect, type Page } from "@playwright/test";
import { assertTaskRequirement, type SimSignInTaskContext, simTaskDefinitions } from "../task-context";

export async function signInForSim(page: Page, context: SimSignInTaskContext): Promise<void> {
  assertTaskRequirement(context, simTaskDefinitions.signIn.requires);
  await page.goto("/signin");
  await page.locator("#email").fill(context.profile.email);
  await page.locator("#password").fill(await context.runtime.getCredential());
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/workspaces/);
}
