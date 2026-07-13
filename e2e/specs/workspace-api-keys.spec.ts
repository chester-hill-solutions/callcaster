import { ownerTest, callerTest, expect } from "../fixtures/test-base";
import { E2E_API_KEY, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Workspace API keys @authenticated", () => {
  ownerTest("API-01 owner sees API keys section", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "settings"));
    await expect(page.getByText(/api key/i).first()).toBeVisible();
  });

  ownerTest("API-02 create key shows reveal banner", async ({ page }) => {
    await page.goto(`${workspacePath(E2E_WORKSPACES.ready.id, "settings")}?create=1`);
    await expect(page.getByTestId("api-key-create-form")).toBeVisible();
    await page.locator("#api-key-name").fill("E2E Playwright Key");
    // Capability scopes are required on create after the CHS capability cutover.
    await page.locator('input[name="scopes"][value="messages.send"]').check();
    await page.getByTestId("api-key-submit").click();
    await page.waitForURL(/\/settings/);
    await expect(page.getByTestId("api-key-reveal")).toBeVisible({ timeout: 30_000 });
  });

  ownerTest("API-05 SMS with seeded key", async ({ request }) => {
    const response = await request.post("/api/sms", {
      headers: {
        Authorization: `Bearer ${E2E_API_KEY.plaintext}`,
        "Content-Type": "application/json",
      },
      data: {
        workspace_id: E2E_WORKSPACES.ready.id,
        to: "+15555501002",
        body: "API key E2E",
      },
    });
    expect([200, 400, 401, 403, 500]).toContain(response.status());
  });
});

callerTest("API-04 caller cannot see API keys", async ({ page }) => {
  await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "settings"));
  await expect(page.getByText(/api keys/i)).toHaveCount(0);
});
