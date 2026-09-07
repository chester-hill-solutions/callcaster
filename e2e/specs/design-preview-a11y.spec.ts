/**
 * Accessibility gate for the semantic tone system (#dark-mode-audit, E3.2).
 *
 * Scans the design preview page — every Alert/Badge/Button/toast tone — plus
 * the workspaces dashboard, in BOTH themes. Tone-colored body text on tone
 * washes passed in light theme and became unreadable in dark; this fails CI
 * on serious/critical violations (contrast included) so both sides stay
 * readable by construction.
 *
 * Before the preview scan, the states the theme work changes are actually
 * rendered: all four toast tones are open, an input is focused, the checkbox
 * and switch are selected, and the disabled, invalid, and loading controls the
 * gallery renders are present. The root theme is asserted so a scan never
 * silently runs in the wrong theme.
 */
import AxeBuilder from "@axe-core/playwright";
import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

const SCAN_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

const THEME_SCRIPT = (theme: "light" | "dark") => `localStorage.setItem("callcaster-theme", "${theme}");`;

/** Sonner toasts live in a body-level portal; scope to it so page alerts are never mistaken for toasts. */
const TOAST = "[data-sonner-toaster] [data-sonner-toast]";
const TOAST_TONES = ["success", "info", "warning", "error"] as const;

async function fullScan(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page }).withTags(SCAN_TAGS).analyze();
}

function seriousViolations(results: Awaited<ReturnType<typeof fullScan>>) {
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function describeViolations(violations: ReturnType<typeof seriousViolations>) {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("; ")}`)
    .join("\n");
}

async function expectRootTheme(page: import("@playwright/test").Page, theme: "light" | "dark") {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
    .toBe(theme === "dark");
}

/** Every tone toast open at once, in the light gallery scope, with focus/selection states applied. */
async function renderInteractiveStates(page: import("@playwright/test").Page) {
  // The root element also carries the theme class, so scope by the gallery's own marker.
  const light = page.locator('[data-theme-scope="light"]');
  for (const tone of TOAST_TONES) {
    await light.getByRole("button", { name: tone, exact: true }).click();
  }
  await expect(page.locator(TOAST)).toHaveCount(TOAST_TONES.length);
  for (const tone of TOAST_TONES) {
    await expect(page.locator(`${TOAST}[data-type="${tone}"]`)).toHaveCount(1);
  }

  // React Aria hides the native inputs behind their indicators; the labels are the click targets.
  await light.locator('label[for="light-preview-checkbox"]').click();
  await expect(light.getByRole("checkbox", { name: "Checkbox" })).toBeChecked();
  await light.locator('label[for="light-preview-switch"]').click();
  await expect(light.getByRole("switch", { name: "Switch" })).toBeChecked();
  await light.getByRole("textbox", { name: "Preview input" }).focus();
  await expect(light.getByRole("textbox", { name: "Preview input" })).toBeFocused();

  await expect(light.getByRole("button", { name: "Disabled" })).toBeDisabled();
  const loading = light.getByRole("button", { name: "Saving…" });
  await expect(loading).toBeDisabled();
  await expect(loading.locator("svg")).toHaveCount(1);
  await expect(light.getByRole("textbox", { name: "Preview invalid input" })).toHaveAttribute("aria-invalid", "true");
}

for (const theme of ["light", "dark"] as const) {
  ownerTest.describe(`design preview a11y — ${theme}`, () => {
    ownerTest(`design preview with every state rendered has no serious/critical violations (${theme})`, async ({ page }) => {
      await page.addInitScript(THEME_SCRIPT(theme));
      await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "design"));
      await expect(page.getByRole("heading", { name: "Design preview — tone system" })).toBeVisible();
      await expectRootTheme(page, theme);
      await renderInteractiveStates(page);

      const results = await fullScan(page);
      // The contrast rule must have run, or a regression could never fail this test.
      const evaluated = [...results.passes, ...results.violations, ...results.incomplete].map((r) => r.id);
      expect(evaluated).toContain("color-contrast");
      const violations = seriousViolations(results);
      expect(violations, describeViolations(violations)).toEqual([]);
    });

    ownerTest(`workspaces dashboard has no serious/critical violations (${theme})`, async ({ page }) => {
      await page.addInitScript(THEME_SCRIPT(theme));
      await page.goto(workspacePath(E2E_WORKSPACES.ready.id));
      await expect(page.getByRole("main")).toBeVisible();
      await expectRootTheme(page, theme);

      const violations = seriousViolations(await fullScan(page));
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });
}
