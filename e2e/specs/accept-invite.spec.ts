import { ownerTest, expect } from "../fixtures/test-base";
import { AUTH_PATHS } from "../fixtures/auth";
import { E2E_WORKSPACES } from "../fixtures/seed";
import { test } from "@playwright/test";

ownerTest.describe("Accept invite @authenticated", () => {
  ownerTest("workspace list shows seeded workspace", async ({ page }) => {
    await page.goto("/workspaces");
    await expect(page.getByText(E2E_WORKSPACES.ready.name)).toBeVisible();
  });
});

test.describe("Accept invite pending user", () => {
  test.use({ storageState: AUTH_PATHS.invitee });

  test("AUTH-12 invitee sees accept invite", async ({ page }) => {
    await page.goto("/accept-invite");
    await expect(page.getByText(/invite|invitation|accept/i).first()).toBeVisible();
  });
});
