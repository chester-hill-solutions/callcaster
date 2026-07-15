export type CatalogPickerTab = "all" | "selected";

export type CatalogPickerSelectionState = "none" | "some" | "all";

export type CatalogPickerItem = {
  value: string;
  label: string;
  description?: string;
  category: string;
};

export type CatalogPickerCategory<T extends CatalogPickerItem = CatalogPickerItem> = {
  category: string;
  items: T[];
};

export function groupCatalogByCategory<T extends CatalogPickerItem>(
  items: readonly T[],
): CatalogPickerCategory<T>[] {
  const categories = new Map<string, T[]>();
  for (const item of items) {
    const existing = categories.get(item.category) ?? [];
    existing.push(item);
    categories.set(item.category, existing);
  }
  return [...categories.entries()].map(([category, categoryItems]) => ({
    category,
    items: categoryItems,
  }));
}

export function filterCatalogItems<T extends CatalogPickerItem>(
  items: readonly T[],
  query: string,
): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...items];
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(normalized) ||
      item.value.toLowerCase().includes(normalized) ||
      item.description?.toLowerCase().includes(normalized) ||
      item.category.toLowerCase().includes(normalized),
  );
}

export function visibleCatalogCategories<T extends CatalogPickerItem>(opts: {
  items: readonly T[];
  query: string;
  tab: CatalogPickerTab;
  selected: ReadonlySet<string>;
}): CatalogPickerCategory<T>[] {
  const filtered = filterCatalogItems(opts.items, opts.query);
  const tabFiltered =
    opts.tab === "selected"
      ? filtered.filter((item) => opts.selected.has(item.value))
      : filtered;
  return groupCatalogByCategory(tabFiltered);
}

export function catalogSelectionCoverage<T extends CatalogPickerItem>(
  items: readonly T[],
  selected: ReadonlySet<string>,
): CatalogPickerSelectionState {
  if (items.length === 0) return "none";
  const selectedCount = items.filter((item) => selected.has(item.value)).length;
  if (selectedCount === 0) return "none";
  if (selectedCount === items.length) return "all";
  return "some";
}
