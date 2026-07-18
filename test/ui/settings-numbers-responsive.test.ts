import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Regression test for audit-F's P1 "settings/numbers unusable on mobile"
// finding: the page laid out at ~1355px and clipped at 390px with zero
// scroll affordance. Root cause was a flexbox min-width:auto blowout — the
// NumbersTable's own <Table> wrapper already scrolls internally
// (`overflow-auto`, see app/components/ui/table.tsx), but nothing upstream
// let the flex/grid items *shrink* to the viewport first, so the whole page
// grew to fit the wide table instead of the table scrolling in place.
//
// After SURF-NUM-01 the route-local brand Panel was replaced with PageShell
// + flat Sections. The shrink contract is now on the responsive grid and
// Section/side wrappers (still min-w-0), not Panel classNames.
//
// jsdom doesn't compute layout, so this can't assert "no horizontal
// overflow at 390px" directly. This asserts the structural shrink fix.
describe("app/routes/workspaces+/$id/settings/numbers.route.tsx responsive layout", () => {
  const source = readFileSync(
    path.resolve(
      __dirname,
      "../../app/routes/workspaces+/$id/settings/numbers.route.tsx",
    ),
    "utf-8",
  );

  test("the responsive grid and list section allow shrinking below content width", () => {
    expect(source).toMatch(
      /grid min-w-0 gap-0 lg:grid-cols-\[2fr_1fr\] lg:gap-8/,
    );
    expect(source).toMatch(/Section variant="flat" className="min-w-0"/);
    expect(source).toContain("PageShell");
    expect(source).not.toMatch(/\bPanel\b/);
  });

  test("the caller-id and purchase side column also allows shrinking", () => {
    expect(source).toMatch(/className="min-w-0 space-y-\d+"/);
    expect(source).toContain("<NumberCallerId");
    expect(source).toContain("<NumberPurchase");
  });
});
