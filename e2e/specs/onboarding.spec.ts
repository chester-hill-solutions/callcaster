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

  for (const theme of ["light", "dark"] as const) {
    ownerTest(`ONB-07 field errors are described and styled (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await page.addInitScript((value) => localStorage.setItem("callcaster-theme", value), theme);
      const onboarding = new OnboardingPage(page);
      await onboarding.goto(E2E_WORKSPACES.onboarding.id, "business_identity");
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
        .toBe(theme === "dark");

      const businessName = page.getByLabel(/Legal business name/);
      const normalBorder = await businessName.evaluate((element) => getComputedStyle(element).borderColor);
      await businessName.fill("");
      await page.getByRole("button", { name: "Save & continue", exact: true }).click();

      await expect(businessName).toHaveAttribute("aria-invalid", "true");
      await expect(businessName).toHaveAccessibleDescription("Legal business name is required.");
      await expect.poll(() => businessName.evaluate((element) => getComputedStyle(element).borderColor))
        .not.toBe(normalBorder);

      await businessName.fill("Acme Outreach");
      await expect(businessName).not.toHaveAttribute("aria-invalid", "true");
      await expect(businessName).toHaveAccessibleDescription("");
      await expect(businessName).toHaveValue("Acme Outreach");
    });
  }
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
