import { test, expect } from "@playwright/test";
import { SignInPage } from "../pages/SignInPage";
import { E2E_USERS, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

test.describe("Auth @smoke", () => {
  test("AUTH-01 unauthenticated workspace redirect", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id));
    await expect(page).toHaveURL(/\/signin\?next=/);
  });

  test("AUTH-02 valid sign-in", async ({ page }) => {
    const signIn = new SignInPage(page);
    await signIn.goto();
    await signIn.login(E2E_USERS.owner.email);
    await expect(page).toHaveURL(/\/workspaces/);
  });

  test("AUTH-03 bad password", async ({ page }) => {
    const signIn = new SignInPage(page);
    await signIn.goto();
    await signIn.login(E2E_USERS.owner.email, "wrong-password");
    await expect(page).toHaveURL(/\/signin/);
  });

  test("AUTH-04 deep link after login", async ({ page }) => {
    const target = workspacePath(E2E_WORKSPACES.ready.id, "campaigns");
    const signIn = new SignInPage(page);
    await signIn.goto(target);
    await signIn.login(E2E_USERS.owner.email);
    await expect(page).toHaveURL(new RegExp(`/workspaces/${E2E_WORKSPACES.ready.id}`));
  });

  test("AUTH-06 sign out", async ({ page }) => {
    // authflow is seeded but excluded from Playwright storageState — sign-out must not revoke shared sessions.
    const signIn = new SignInPage(page);
    await signIn.goto();
    await signIn.login(E2E_USERS.authflow.email);
    await page.getByTestId("navbar-user-menu").click();
    await page.locator("#logoutButton").click();
    await expect(page).toHaveURL(/\/\/127\.0\.0\.1:3100\/?$/);
  });

  test("AUTH-08 invite-only signup UI", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByText("Request Access")).toBeVisible();
  });
});
