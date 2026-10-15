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

    await page.getByLabel("Add a script block").click();
    await page.getByRole("option", { name: "Text area" }).click();

    await expect(page.getByLabel("block title").last()).toHaveValue(/^Block \d+$/);
  });

  ownerTest("SCR-04 an IVR step switched to a recording offers the library picker and inline upload", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `scripts/${E2E_IVR_SCRIPT.id}`));

    await page.getByRole("combobox", { name: "Block type" }).first().click();
    await page.getByRole("option", { name: "Recording" }).click();

    await expect(
      page.getByRole("combobox", { name: "Block type" }).first(),
    ).toHaveText("Recording");
    await expect(page.getByLabel("Recording").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /upload audio/i }).first()).toBeVisible();
  });

  ownerTest("SCR-05 IVR scripts add audio steps, not form blocks", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `scripts/${E2E_IVR_SCRIPT.id}`));

    await expect(page.getByLabel("Add a script block")).toHaveCount(0);
    await page.getByRole("button", { name: "Add a script block" }).click();

    await expect(page.getByLabel("block title").last()).toHaveValue(/^Step \d+$/);
    await expect(
      page.getByRole("combobox", { name: "Block type" }).last(),
    ).toHaveText("Recording");
    await expect(page.getByRole("button", { name: /upload audio/i }).last()).toBeVisible();
    await expect(page.getByLabel("Question").last()).toHaveCount(0);
  });

  ownerTest("AUD-06 audios list", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "audios"));
    await expect(page.getByText(/audio|upload/i).first()).toBeVisible();
  });

  ownerTest("SCR-06 seeded IVR speech and keypad response are ready to use", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, `scripts/${E2E_IVR_SCRIPT.id}`));

    await expect(page.getByLabel("Speech text").first()).toHaveValue("Press 1 for yes");
    await expect(page.getByLabel("Recipient answers with").first()).toHaveText("Press 1");
    await expect(page.getByLabel("Answer label").first()).toHaveValue("Yes");
    await expect(page.getByLabel("Then go to").first()).toHaveText("Hang up");
  });
});
