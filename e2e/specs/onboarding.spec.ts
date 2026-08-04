import { ownerTest, memberTest, expect } from "../fixtures/test-base";
import { OnboardingPage } from "../pages/OnboardingPage";
import { E2E_WORKSPACES } from "../fixtures/seed";

ownerTest.describe("Onboarding @authenticated", () => {
  ownerTest("ONB-01 onboarding wizard loads", async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await onboarding.goto(E2E_WORKSPACES.onboarding.id);
    await expect(page.getByRole("heading", { name: "Name your workspace" })).toBeVisible();
    await expect(page.getByLabel(/workspace name/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  ownerTest("ONB-06 step deep link", async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await onboarding.goto(E2E_WORKSPACES.onboarding.id, "business_identity");
    await expect(page).toHaveURL(/step=business_identity/);
    await expect(page.getByRole("heading", { name: "Business identity" })).toBeVisible();
  });
});

memberTest("ONB-02 member read-only onboarding", async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.goto(E2E_WORKSPACES.onboarding.id);
  const inputs = page.locator("input:not([type=hidden])");
  const count = await inputs.count();
  if (count > 0) {
    await expect(inputs.first()).toBeDisabled();
  }
});
