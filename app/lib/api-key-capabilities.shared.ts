import {
  filterCatalogItems,
  groupCatalogByCategory,
  visibleCatalogCategories,
  catalogSelectionCoverage,
  type CatalogPickerItem,
  type CatalogPickerTab,
} from "@/lib/catalog-picker.shared";
import {
  PRODUCT_CAPABILITIES,
  isProductCapabilityId,
  type ProductCapabilityId,
} from "@/lib/capabilities";

export type ApiKeyCapabilityOption = CatalogPickerItem & {
  value: ProductCapabilityId;
};

const CAPABILITY_CATEGORIES: Record<ProductCapabilityId, string> = {
  "campaigns.read": "Campaigns",
  "campaigns.write": "Campaigns",
  "campaigns.dispatch": "Campaigns",
  "calls.start": "Telephony",
  "calls.control": "Telephony",
  "messages.send": "Messaging",
  "members.invite": "Workspace",
  "audit.read": "Workspace",
};

export const API_KEY_CAPABILITY_OPTIONS: readonly ApiKeyCapabilityOption[] = (
  Object.entries(PRODUCT_CAPABILITIES) as Array<[ProductCapabilityId, string]>
).map(([value, description]) => ({
  value,
  label: value,
  description,
  category: CAPABILITY_CATEGORIES[value],
}));

export type ApiKeyCapabilityCategory = {
  category: string;
  options: ApiKeyCapabilityOption[];
};

export function filterApiKeyCapabilityOptions(
  options: readonly ApiKeyCapabilityOption[],
  query: string,
): ApiKeyCapabilityOption[] {
  return filterCatalogItems(options, query);
}

export function groupApiKeyCapabilityOptions(
  options: readonly ApiKeyCapabilityOption[],
): ApiKeyCapabilityCategory[] {
  return groupCatalogByCategory(options).map(({ category, items }) => ({
    category,
    options: items,
  }));
}

export function visibleApiKeyCapabilityCategories(opts: {
  options: readonly ApiKeyCapabilityOption[];
  query: string;
  tab: CatalogPickerTab;
  selected: ReadonlySet<string>;
}): ApiKeyCapabilityCategory[] {
  return visibleCatalogCategories({
    items: opts.options,
    query: opts.query,
    tab: opts.tab,
    selected: opts.selected,
  }).map(({ category, items }) => ({ category, options: items }));
}

export function apiKeyCapabilitySelectionCoverage(
  options: readonly ApiKeyCapabilityOption[],
  selected: ReadonlySet<string>,
) {
  return catalogSelectionCoverage(options, selected);
}

/**
 * Parse capability scopes from form checkboxes named `scopes`.
 * Returns only known product capability IDs (allowlisted).
 */
export function parseApiKeyScopesFromForm(form: FormData): ProductCapabilityId[] {
  const raw = form.getAll("scopes").map((value) => String(value).trim());
  const scopes = raw.filter(isProductCapabilityId);
  return [...new Set(scopes)];
}
