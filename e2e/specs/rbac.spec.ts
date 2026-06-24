import { callerTest, memberTest, ownerTest, adminTest, expect } from "../fixtures/test-base";
import { setWorkspaceCredits } from "../fixtures/factories";
import { WorkspacePage } from "../pages/WorkspacePage";
import {
  E2E_CAMPAIGNS,
  E2E_WORKSPACES,
  workspacePath,
} from "../fixtures/seed";
import { AUTH_PATHS } from "../fixtures/auth";
import { test } from "@playwright/test";
import { CallScreenPage } from "../pages/CallScreenPage";

test.describe("RBAC @rbac @security", () => {
  callerTest("RBAC-01 caller nav restrictions", async ({ page }) => {
    const ws = new WorkspacePage(page);
    await ws.goto(E2E_WORKSPACES.ready.id);
    await ws.expectNavVisible("Campaigns");
    await ws.expectNavVisible("Chats");
    await expect(page.getByRole("link", { name: "Scripts" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Audiences" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Exports" })).toHaveCount(0);
  });

  callerTest("RBAC-03 caller settings limited", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "settings"));
    await expect(page.getByText(/quit this workspace/i)).toBeVisible();
    await expect(page.getByText(/invite user/i)).toHaveCount(0);
  });

  callerTest("RBAC-04 caller blocked from numbers settings", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "settings/numbers"));
    await expect(page).not.toHaveURL(/settings\/numbers$/);
  });

  memberTest("RBAC-09 member empty campaign CTA", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "campaigns"));
    await expect(page.getByText(/contact your admin team/i)).toBeVisible();
  });

  ownerTest("RBAC-14 owner onboarding redirect", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.onboarding.id));
    await expect(page).toHaveURL(/\/onboarding/);
  });

  adminTest("RBAC-14 admin onboarding redirect", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.onboarding.id));
    await expect(page).toHaveURL(/\/onboarding/);
  });

  memberTest("RBAC-15 member onboarding banner without continue", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.onboarding.id));
    await expect(page.getByText(/Messaging onboarding still has required steps/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /continue onboarding/i })).toHaveCount(0);
  });

  test("RBAC-17 non-member redirected", async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_PATHS.caller });
    const page = await context.newPage();
    await page.goto(workspacePath(E2E_WORKSPACES.onboarding.id));
    await expect(page).toHaveURL(/\/workspaces$/);
    await context.close();
  });

  callerTest("RBAC-06 caller surveys new forbidden", async ({ page }) => {
    const response = await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "surveys/new"));
    expect(response?.status()).toBe(403);
  });

  callerTest("RBAC-18 caller zero credits dialog", async ({ page }) => {
    await setWorkspaceCredits(E2E_WORKSPACES.ready.id, 0);
    const callScreen = new CallScreenPage(page);
    await callScreen.goto(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.liveCall.id);
    await expect(page.getByText(/Campaign Disabled|contact your administrator/i).first()).toBeVisible();
    await setWorkspaceCredits(E2E_WORKSPACES.ready.id, 500);
  });
});
