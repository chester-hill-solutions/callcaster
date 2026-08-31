/**
 * Accessibility gate for the semantic tone system (#dark-mode-audit).
 *
 * Scans the design preview page — every Alert/Badge/Button/toast tone — plus
 * the workspaces dashboard, in BOTH themes. Tone-colored body text on tone
 * washes passed in light theme and became unreadable in dark; this fails CI
 * on serious/critical violations (contrast included) so both sides stay
 * readable by construction.
 */
import AxeBuilder from "@axe-core/playwright";
import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

const SCAN_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

const THEME_SCRIPT = (theme: "light" | "dark") => `localStorage.setItem("callcaster-theme", "${theme}");`;

async function scan(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(SCAN_TAGS).analyze();
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function describeViolations(violations: Awaited<ReturnType<typeof scan>>) {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("; ")}`)
    .join("\n");
}

for (const theme of ["light", "dark"] as const) {
  ownerTest.describe(`design preview a11y — ${theme}`, () => {
    ownerTest(`design preview has no serious/critical violations (${theme})`, async ({ page }) => {
      await page.addInitScript(THEME_SCRIPT(theme));
      await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "design"));
      await expect(page.getByRole("heading", { name: "Design preview — tone system" })).toBeVisible();

      const violations = await scan(page);
      expect(violations, describeViolations(violations)).toEqual([]);
    });

    ownerTest(`workspaces dashboard has no serious/critical violations (${theme})`, async ({ page }) => {
      await page.addInitScript(THEME_SCRIPT(theme));
      await page.goto(workspacePath(E2E_WORKSPACES.ready.id));
      await expect(page.getByRole("main")).toBeVisible();

      const violations = await scan(page);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });
}
