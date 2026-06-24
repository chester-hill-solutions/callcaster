import path from "node:path";
import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_AUDIENCE, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

const goodCsv = path.join(process.cwd(), "e2e/fixtures/files/audience-good.csv");

ownerTest.describe("Audience and contacts @authenticated", () => {
  ownerTest("AUD-03 audience detail", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `audiences/${E2E_AUDIENCE.id}`));
    await expect(page.getByRole("heading", { name: "E2E Audience" })).toBeVisible();
    await expect(page.getByText("Contact1").first()).toBeVisible();
  });

  ownerTest("AUD-01 CSV upload form", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "audiences/new"));
    await page.locator("#audience-name").fill("E2E Upload Test");
    await page.getByRole("button", { name: /Next: Upload Contacts/i }).click();
    await expect(page.getByRole("heading", { name: "Upload Contacts" })).toBeVisible();
    await page.locator("#contacts").setInputFiles(goodCsv);
    await expect(page.getByText(/Map CSV Headers|Upload contacts/i).first()).toBeVisible();
  });

  ownerTest("AUD-04 contacts list", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "contacts"));
    await expect(page.getByText(/Contact1|contacts/i).first()).toBeVisible();
  });
});
