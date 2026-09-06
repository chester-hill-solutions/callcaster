import { ownerTest, memberTest, expect } from "../fixtures/test-base";
import { E2E_WORKSPACES } from "../fixtures/seed";

/**
 * A workspace with no numbers, no traffic, and no business basics sends its
 * owner into the setup wizard on first visit (`$id.loader.server.ts`). The
 * "Empty" fixture cannot exercise this: its rented number puts it in legacy
 * mode, which suppresses the redirect (#1069).
 */
ownerTest.describe("Fresh workspace onboarding redirect", () => {
  ownerTest("ONB-01 owner opening a fresh workspace lands in onboarding", async ({ page }) => {
    await page.goto(`/workspaces/${E2E_WORKSPACES.fresh.id}`);
    await expect(page).toHaveURL(new RegExp(`/workspaces/${E2E_WORKSPACES.fresh.id}/onboarding`));
  });

  ownerTest("ONB-02 a legacy-mode workspace with a number stays on its dashboard", async ({ page }) => {
    await page.goto(`/workspaces/${E2E_WORKSPACES.empty.id}`);
    await expect(page).not.toHaveURL(/\/onboarding/);
    await expect(page).toHaveURL(new RegExp(`/workspaces/${E2E_WORKSPACES.empty.id}`));
  });
});

memberTest("ONB-03 a non-member is bounced to the workspace picker, not into onboarding", async ({ page }) => {
  await page.goto(`/workspaces/${E2E_WORKSPACES.fresh.id}`);
  await expect(page).toHaveURL(/\/workspaces\/?(\?.*)?$/);
  await expect(page).not.toHaveURL(new RegExp(E2E_WORKSPACES.fresh.id));
});
