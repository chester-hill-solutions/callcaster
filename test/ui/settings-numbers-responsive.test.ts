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
// + flat Sections. Rent sits below Your numbers (stacked), with min-w-0 on
// wrappers so wide number tables still scroll in place.
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

  test("sections stack vertically and allow shrinking below content width", () => {
    expect(source).toMatch(/flex min-w-0 flex-col/);
    expect(source).toMatch(/Section variant="flat" className="min-w-0"/);
    expect(source).toContain("PageShell");
    expect(source).not.toMatch(/\bPanel\b/);
    expect(source).not.toMatch(/lg:grid-cols-/);
  });

  test("rent section sits below your numbers with a 300px floor", () => {
    const yourNumbersIdx = source.indexOf('title="Your numbers"');
    const rentIdx = source.indexOf('title="Rent a number"');
    expect(yourNumbersIdx).toBeGreaterThan(-1);
    expect(rentIdx).toBeGreaterThan(yourNumbersIdx);
    expect(source).toMatch(/Section variant="flat" className="min-w-\[300px\]"/);
    expect(source).toContain("<NumberCallerId");
    expect(source).toContain("<NumberPurchase");
  });

  test("address and compliance gates stay on the primary path above rent", () => {
    const addressIdx = source.indexOf("<ServiceAddressGate");
    const complianceIdx = source.indexOf("<SmsComplianceGate");
    const rentIdx = source.indexOf('title="Rent a number"');
    const accordionIdx = source.indexOf("<Accordion");
    expect(addressIdx).toBeGreaterThan(-1);
    expect(complianceIdx).toBeGreaterThan(-1);
    expect(addressIdx).toBeLessThan(rentIdx);
    expect(complianceIdx).toBeLessThan(rentIdx);
    // Caller ID alone may stay behind progressive disclosure.
    expect(accordionIdx).toBeGreaterThan(rentIdx);
    expect(source).toContain("Caller ID verification");
    expect(source).not.toContain("Address, compliance, and caller ID");
  });
});
