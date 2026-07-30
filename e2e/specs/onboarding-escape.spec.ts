import { ownerTest, expect } from "../fixtures/test-base";
import { OnboardingPage } from "../pages/OnboardingPage";
import { E2E_WORKSPACES } from "../fixtures/seed";

/**
 * Regression guard for the onboarding trap (2026-07-30).
 *
 * The intake gate demanded four business-profile fields while the Identity
 * screen collected two, and the screen that collected the other two was shown
 * only for the SMS goal. Every calling / IVR / rent-a-number workspace was
 * therefore redirected from the workspace root back into the wizard forever.
 *
 * Nothing caught it: the unit test hand-built a profile the UI could no longer
 * produce, and no E2E ever walked a goal to completion or asserted that a user
 * can *leave* onboarding. That second assertion is the point of this file — the
 * bug is not "a step errors", it is "the exit never opens".
 */
ownerTest.describe("Onboarding escape @authenticated", () => {
  ownerTest(
    "ONB-07 a non-SMS goal can complete intake and reach the workspace",
    async ({ page }) => {
      const workspaceId = E2E_WORKSPACES.onboarding.id;
      const onboarding = new OnboardingPage(page);

      // Goal first. Pick a goal that does NOT need SMS compliance — this is the
      // population the trap affected.
      await onboarding.goto(workspaceId, "path_selection");
      const liveCall = page.locator('input[name="goalChoice"][value="live_call"]');
      await expect(liveCall).toBeVisible();
      await liveCall.check();
      await page.getByRole("button", { name: /save & continue/i }).click();

      // Identity: the only two fields the wizard ever collects for this goal.
      await onboarding.goto(workspaceId, "business_identity");
      await page.locator('input[name="legalBusinessName"]').fill("E2E Escape Co");
      await page.locator('input[name="websiteUrl"]').fill("https://example.com");
      await page.getByRole("button", { name: /save & continue/i }).click();
      await expect(page.locator('input[name="legalBusinessName"]')).toHaveCount(0, {
        timeout: 15_000,
      });

      // The assertion that matters: the workspace root must now be reachable.
      // While the trap existed this bounced straight back to /onboarding.
      await page.goto(`/workspaces/${workspaceId}`);
      await expect(page).not.toHaveURL(/\/onboarding/);
      await expect(page).toHaveURL(new RegExp(`/workspaces/${workspaceId}`));
    },
  );
});
