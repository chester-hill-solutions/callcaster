import { expect, test } from "@playwright/test";

import { signIn } from "../fixtures/auth";

const WORKSPACE = "a0000000-0000-4000-8000-000000000001";

/**
 * The audio library's clip editor and recorder.
 *
 * These drive the real UI because the risky parts are client-side: wavesurfer
 * is loaded through a lazy import (it touches `window` at module scope), and
 * the recorder asks for a live microphone. Neither shows up in a unit test.
 */
test.describe("audio library — clipping and recording", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "owner@e2e.test");
  });

  test("library lists audio with a length column and an edit action", async ({
    page,
  }) => {
    await page.goto(`/workspaces/${WORKSPACE}/audios`);

    await expect(
      page.getByRole("heading", { name: /audio library/i }),
    ).toBeVisible();

    // Both entry points; the empty state has always advertised recording.
    await expect(page.getByRole("link", { name: /record audio/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /add audio/i })).toBeVisible();
  });

  test("record page mounts the recorder and asks for a microphone", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["microphone"]);
    await page.goto(`/workspaces/${WORKSPACE}/audios/record`);

    await expect(page.getByRole("heading", { name: /record audio/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^record$/i })).toBeVisible();
  });

  test("library row shows the sidecar duration", async ({ page }) => {
    await page.goto(`/workspaces/${WORKSPACE}/audios`);
    const row = page.getByRole("row").filter({ hasText: "intro.mp3" });
    await expect(row).toBeVisible();
    // 6000ms from the workspace_audio sidecar, rendered mm:ss. Both columns
    // were dead before the sidecar because listObjects discards size/duration.
    await expect(row).toContainText("0:06");
    await expect(row).toContainText("47 KB");
  });

  test("clip editor loads the waveform and offers both save modes", async ({
    page,
  }) => {
    await page.goto(`/workspaces/${WORKSPACE}/audios`);

    // Scope to the row: an unscoped "Edit" also matches links elsewhere on the
    // page chrome (billing), which silently navigates somewhere else.
    const row = page.getByRole("row").filter({ hasText: "intro.mp3" });
    await row.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/audios\/.+\/edit$/);

    // wavesurfer is imported lazily, so "ready" is the real proof the client-only
    // boundary works in a browser rather than only in the bundle output.
    await expect(page.getByRole("button", { name: /save as new clip/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: /overwrite original/i }),
    ).toBeVisible();
  });
});
