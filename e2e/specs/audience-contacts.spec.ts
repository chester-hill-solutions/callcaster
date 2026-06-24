import path from "node:path";
import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_AUDIENCE, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

const goodCsv = path.join(process.cwd(), "e2e/fixtures/files/audience-good.csv");
const badCsv = path.join(process.cwd(), "e2e/fixtures/files/audience-bad-headers.csv");

ownerTest.describe("Audience and contacts @authenticated", () => {
  ownerTest("AUD-03 audience detail", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `audiences/${E2E_AUDIENCE.id}`));
    await expect(page.getByText(/E2E Audience|contact/i).first()).toBeVisible();
  });

  ownerTest("AUD-01 CSV upload form", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "audiences/new"));
    await page.setInputFiles('input[type="file"]', goodCsv);
    await expect(page.getByText(/upload|csv|audience/i).first()).toBeVisible();
  });

  ownerTest("AUD-04 contacts list", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "contacts"));
    await expect(page.getByText(/Contact1|contacts/i).first()).toBeVisible();
  });
});
