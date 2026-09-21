import { expect, test } from "@playwright/test";

/**
 * The marketing home's mobile navigation sheet used inline links, so its items
 * flowed horizontally and wrapped instead of stacking. Assert each link
 * starts on its own row on a phone viewport.
 */
test.describe("Marketing home mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the nav sheet stacks its links vertically", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation menu" }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    let previous: { name: string; bottom: number } | null = null;

    for (const name of ["Home", "Docs", "Sign In", "Sign Up"]) {
      const link = sheet.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();

      const box = await link.boundingBox();
      if (!box) {
        throw new Error(`${name} link has no layout box`);
      }

      // Inline links share a row: the next link's top is above the previous
      // link's bottom. Stacked links always start below it.
      if (previous) {
        expect(
          box.y,
          `${name} starts below ${previous.name}`,
        ).toBeGreaterThanOrEqual(previous.bottom - 1);
      }
      previous = { name, bottom: box.y + box.height };
    }
  });
});
