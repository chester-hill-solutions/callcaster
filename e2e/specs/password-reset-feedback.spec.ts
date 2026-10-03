import { test, expect } from "@playwright/test";

const expiredMessage =
  "This reset link is invalid or has expired. Request a new one from the sign-in page.";

for (const width of [360, 1280]) {
  for (const theme of ["light", "dark"]) {
    test(`reset failure keeps page layout: ${width}px ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript(
        (mode) => localStorage.setItem("callcaster-theme", mode),
        theme,
      );
      await page.goto("/reset-password?token=missing-feedback-test-token");
      await page
        .getByLabel("New Password", { exact: true })
        .fill("RetainedPassword1!");
      await page
        .getByLabel("Confirm New Password", { exact: true })
        .fill("RetainedPassword1!");
      await page.evaluate(() => document.fonts.ready);

      const geometry = () =>
        page.evaluate(() => ({
          scroll: [window.scrollX, window.scrollY],
          document: [
            document.documentElement.scrollWidth,
            document.documentElement.scrollHeight,
          ],
          landmarks: Array.from(
            document.querySelectorAll(
              "nav, main, #login-hero, [data-slot=card-header], [data-slot=card-content], label, input, button[type=submit]",
            ),
            (node) => {
              const { x, y, width, height } = node.getBoundingClientRect();
              return [x, y, width, height];
            },
          ),
        }));
      const before = await geometry();
      await page
        .getByRole("button", { name: "Reset Password", exact: true })
        .click();
      const result = page
        .locator("[data-sonner-toast]")
        .filter({ hasText: expiredMessage });
      await expect(result).toHaveCount(1);
      await expect(result).toBeVisible();
      await expect(page.getByText(expiredMessage, { exact: true })).toHaveCount(
        1,
      );
      await expect(
        page.getByRole("main").getByText(expiredMessage),
      ).toHaveCount(0);
      await expect(
        page.getByLabel("New Password", { exact: true }),
      ).toHaveValue("RetainedPassword1!");
      await expect(
        page.getByLabel("Confirm New Password", { exact: true }),
      ).toHaveValue("RetainedPassword1!");
      expect(await geometry()).toEqual(before);

      // Expiring transient feedback must not move the form or its action.
      await expect(result).toHaveCount(0, { timeout: 10_000 });
      expect(await geometry()).toEqual(before);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Choose New Password" }),
      ).toBeVisible();
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    });
  }
}
