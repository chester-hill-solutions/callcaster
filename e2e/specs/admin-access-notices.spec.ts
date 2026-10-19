import { expect, sudoTest, test } from "../fixtures/test-base";
import { E2E_WORKSPACES } from "../fixtures/seed";

/**
 * The Access tab lives on the admin workspace route, and the routed child
 * used to be a bare child of the Tabs collection. React Aria's tabs tree
 * remounted it, so the replacement useActionFeedback instance started with an
 * empty identity guard and re-handled the action result that was already in
 * useActionData. One action produced two success notices.
 *
 * A toast is the only visible symptom, so the assertion is on the toast count.
 */
test.describe("Admin Access notices @sudo", () => {
  sudoTest("ACC-01 one action shows one success notice", async ({ page }) => {
    await page.goto(`/admin/workspaces/${E2E_WORKSPACES.ready.id}/invite`);

    const email = `e2e-access-notice-${Date.now()}@example.test`;
    await page.getByLabel("Email").fill(email);
    // `exact` matters: the pending-invitation list renders a "Cancel invite
    // for <address>" button, and a loose name match resolves to two elements.
    await page.getByRole("button", { name: "Invite", exact: true }).click();

    const notice = page.getByText("Action completed successfully!");
    await expect(notice.first()).toBeVisible();

    // The count is asserted with a short timeout on purpose. A failure here
    // should report the duplicate, not an expired toast: the default expect
    // timeout outlasts the toast, so the count would read zero by the time it
    // gave up.
    await expect(notice).toHaveCount(1, { timeout: 2_000 });

    // A duplicate notice is a remount, and a remount lands in the same commit
    // as the action result. Give a late second notice a chance to arrive
    // before the count is taken as final.
    await page.waitForTimeout(750);
    await expect(notice).toHaveCount(1, { timeout: 2_000 });
  });
});
