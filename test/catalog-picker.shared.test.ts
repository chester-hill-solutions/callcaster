import { describe, expect, test } from "vitest";
import {
  catalogSelectionCoverage,
  filterCatalogItems,
  groupCatalogByCategory,
  visibleCatalogCategories,
} from "@/lib/catalog-picker.shared";

const ITEMS = [
  {
    value: "campaigns.read",
    label: "campaigns.read",
    description: "Read campaigns",
    category: "Campaigns",
  },
  {
    value: "calls.start",
    label: "calls.start",
    description: "Start dialer",
    category: "Telephony",
  },
  {
    value: "messages.send",
    label: "messages.send",
    description: "Send SMS",
    category: "Messaging",
  },
] as const;

describe("catalog-picker.shared", () => {
  test("groups items by category preserving order of first appearance", () => {
    const groups = groupCatalogByCategory(ITEMS);
    expect(groups.map((g) => g.category)).toEqual([
      "Campaigns",
      "Telephony",
      "Messaging",
    ]);
    expect(groups[0].items).toHaveLength(1);
  });

  test("filters by label, value, description, and category", () => {
    expect(filterCatalogItems(ITEMS, "sms")).toEqual([ITEMS[2]]);
    expect(filterCatalogItems(ITEMS, "Telephony")).toEqual([ITEMS[1]]);
    expect(filterCatalogItems(ITEMS, "campaigns.read")).toEqual([ITEMS[0]]);
    expect(filterCatalogItems(ITEMS, "")).toHaveLength(3);
  });

  test("visibleCatalogCategories respects selected tab", () => {
    const selected = new Set(["messages.send"]);
    const categories = visibleCatalogCategories({
      items: ITEMS,
      query: "",
      tab: "selected",
      selected,
    });
    expect(categories).toEqual([
      { category: "Messaging", items: [ITEMS[2]] },
    ]);
  });

  test("catalogSelectionCoverage returns none/some/all", () => {
    expect(catalogSelectionCoverage(ITEMS, new Set())).toBe("none");
    expect(catalogSelectionCoverage(ITEMS, new Set(["calls.start"]))).toBe("some");
    expect(
      catalogSelectionCoverage(
        ITEMS,
        new Set(["campaigns.read", "calls.start", "messages.send"]),
      ),
    ).toBe("all");
    expect(catalogSelectionCoverage([], new Set())).toBe("none");
  });
});
