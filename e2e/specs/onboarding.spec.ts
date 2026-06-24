import { ownerTest, memberTest, expect } from "../fixtures/test-base";
import { OnboardingPage } from "../pages/OnboardingPage";
import { E2E_WORKSPACES } from "../fixtures/seed";

ownerTest.describe("Onboarding @authenticated", () => {
  ownerTest("ONB-01 onboarding wizard loads", async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await onboarding.goto(E2E_WORKSPACES.onboarding.id);
    await expect(onboarding.stepIndicator()).toBeVisible();
    await expect(page.getByText(/business|onboarding/i).first()).toBeVisible();
  });

  ownerTest("ONB-06 step deep link", async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await onboarding.goto(E2E_WORKSPACES.onboarding.id, "path_selection");
    await expect(page).toHaveURL(/step=path_selection/);
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
