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

  ownerTest("SCR-04 an IVR step switched to a recording offers the library picker and inline upload", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `scripts/${E2E_IVR_SCRIPT.id}`));

    await page.getByRole("button", { name: "Play a recording" }).first().click();

    await expect(page.getByText("Recording step").first()).toBeVisible();
    await expect(page.getByLabel("Recording").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /upload audio/i }).first()).toBeVisible();
  });

  ownerTest("SCR-05 IVR scripts add audio steps, not form blocks", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `scripts/${E2E_IVR_SCRIPT.id}`));

    await expect(page.getByLabel("Add block")).toHaveCount(0);
    await page.getByRole("button", { name: "Add spoken step" }).click();

    await expect(page.getByLabel("Step name").last()).toHaveValue(/^Step \d+$/);
    await expect(page.getByLabel("Speech text").last()).toBeVisible();
    await expect(page.getByLabel("Voice").last()).toBeVisible();
  });

  ownerTest("AUD-06 audios list", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "audios"));
    await expect(page.getByText(/audio|upload/i).first()).toBeVisible();
  });
});
