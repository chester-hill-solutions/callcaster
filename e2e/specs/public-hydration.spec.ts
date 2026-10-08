import { expect, test } from "@playwright/test";

test.describe("public authentication hydration (#1750)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const width of [375, 1280]) {
    for (const theme of ["light", "dark"] as const) {
      test(`${width}px ${theme} retains first paint and hydrates without errors`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(storedTheme => {
          localStorage.setItem("callcaster-theme", storedTheme);
          const observer = new MutationObserver(() => {
            if (!document.querySelector('input[name="email"]')) return;
            (window as Window & { firstFormTheme?: string }).firstFormTheme =
              document.documentElement.classList.contains("dark") ? "dark" : "light";
            observer.disconnect();
          });
          observer.observe(document, { childList: true, subtree: true });
        }, theme);

        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        const response = await page.goto("/signin");
        expect(response?.status()).toBe(200);
        const email = page.getByLabel("Email", { exact: true });
        await expect(email).toBeVisible();
        // A resolved label proves the client mounted; SSR alone cannot pass.
        await expect(page.getByRole("button", { name: new RegExp(`Theme mode: ${theme}\\.`) })).toBeVisible();
        await email.fill("owned-hydration@example.invalid");
        await expect(email).toHaveValue("owned-hydration@example.invalid");
        expect(await page.evaluate(() => (window as Window & { firstFormTheme?: string }).firstFormTheme))
          .toBe(theme);
        expect(await page.locator("html").evaluate(element => element.classList.contains("dark")))
          .toBe(theme === "dark");
        expect(await page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor))
          .not.toBe("rgba(0, 0, 0, 0)");
        // Includes every page error; do not filter the known React exception.
        expect(errors).toEqual([]);
      });
    }
  }
});
