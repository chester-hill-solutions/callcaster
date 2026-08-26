import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_IVR_SCRIPT, E2E_SCRIPT, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Scripts and audio @authenticated", () => {
  ownerTest("SCR-01 scripts list", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "scripts"));
    await expect(page.getByText(/E2E Live Script|script/i).first()).toBeVisible();
  });

  ownerTest("SCR-02 edit script", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `scripts/${E2E_SCRIPT.id}`));
    await expect(page.getByText(/script|block|intro/i).first()).toBeVisible();
  });

  ownerTest("SCR-03 new blocks get a default title", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `scripts/${E2E_SCRIPT.id}`));

    await page.getByLabel("Add block").click();
    await page.getByRole("option", { name: "Text area" }).click();

    await expect(page.getByLabel("Title").last()).toHaveValue(/^Block \d+$/);
  });

  ownerTest("SCR-04 recorded IVR blocks offer inline audio upload", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `scripts/${E2E_IVR_SCRIPT.id}`));

    await page.getByLabel("IVR block type").click();
    await page.getByRole("option", { name: "Recorded audio" }).click();

    await expect(page.getByRole("button", { name: /upload audio/i })).toBeVisible();
  });

  ownerTest("AUD-06 audios list", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "audios"));
    await expect(page.getByText(/audio|upload/i).first()).toBeVisible();
  });
});
