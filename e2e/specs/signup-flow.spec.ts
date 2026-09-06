import { test, expect } from "../fixtures/test-base";
import { E2E_PASSWORD } from "../fixtures/seed";

/**
 * The whole first-run path a new customer takes: create an account, land on
 * the workspace picker, create a workspace, and be sent straight into the
 * setup wizard because the new workspace has no numbers, traffic, or
 * business basics (#1167). Runs headless in CI; for a supervised run use
 * `npm run test:e2e:signup:headed`.
 *
 * Each run signs up a unique address so reruns against the same seeded
 * database never collide; the compose harness resets the database anyway.
 */
test.describe("Full sign-up flow", () => {
  test("SIGNUP-01 new account → workspace picker → new workspace → onboarding", async ({ page }) => {
    const email = `signup-${Date.now()}@e2e.test`;
    const workspaceName = `Signup Workspace ${Date.now()}`;

    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
    await page.getByLabel("First Name").fill("Sam");
    await page.getByLabel("Last Name").fill("Signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign Up" }).click();

    // A brand-new account owns nothing yet: the picker offers its first workspace.
    await expect(page).toHaveURL(/\/workspaces\/?(\?.*)?$/);
    await page.getByRole("button", { name: "Create your first workspace" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Add a New Workspace" })).toBeVisible();
    await dialog.getByLabel("Enter your Workspace Name").fill(workspaceName);
    await dialog.getByRole("button", { name: /create|add/i }).click();

    // The new workspace is fresh, so its owner is redirected into the wizard.
    await expect(page).toHaveURL(/\/workspaces\/[0-9a-f-]{36}\/onboarding/);
  });

  test("SIGNUP-02 an address that already exists cannot register again", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill("owner@e2e.test");
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign Up" }).click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByRole("alert").or(page.getByText(/already|exists|in use/i)).first()).toBeVisible();
  });
});
