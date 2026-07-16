import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Regression test for audit-F's P1 "settings/numbers unusable on mobile"
// finding: the page laid out at ~1355px and clipped at 390px with zero
// scroll affordance. Root cause was a flexbox min-width:auto blowout — the
// NumbersTable's own <Table> wrapper already scrolls internally
// (`overflow-auto`, see app/components/ui/table.tsx), but nothing upstream
// let the flex row/items *shrink* to the viewport first, so the whole page
// grew to fit the wide table instead of the table scrolling in place.
//
// jsdom doesn't compute layout, so this can't assert "no horizontal
// overflow at 390px" directly (that was verified against the live preview
// instead — see the fix agent's final report). This asserts the structural
// fix: min-w-0 on the row and on every flex item wrapping the table/panels,
// which is what allows the table's own overflow-auto container to actually
// constrain and scroll instead of the ancestor chain refusing to shrink.
describe("app/routes/workspaces+/$id/settings/numbers.route.tsx responsive layout", () => {
  const source = readFileSync(
    path.resolve(
      __dirname,
      "../../app/routes/workspaces+/$id/settings/numbers.route.tsx",
    ),
    "utf-8",
  );

  test("the panel row and both flex-item wrappers allow shrinking below content width", () => {
    expect(source).toMatch(/flex min-w-0 flex-wrap gap-4 p-4/);
    expect(source).toMatch(
      /Panel className="min-w-0 flex-shrink-0 flex-grow basis-full/,
    );
    expect(source).toMatch(
      /flex min-w-0 flex-shrink-0 flex-grow basis-full flex-col/,
    );
  });

  test("the caller-id and purchase side panels also allow shrinking", () => {
    const sidePanelMatches = source.match(/<Panel className="min-w-0">/g) ?? [];
    expect(sidePanelMatches.length).toBe(2);
  });
});
