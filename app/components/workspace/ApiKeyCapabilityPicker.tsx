import { useMemo, useState } from "react";

import {
  CatalogPickerCategorySection,
  CatalogPickerShell,
  type CatalogPickerTab,
} from "@/components/ui/catalog-picker-shell";
import {
  API_KEY_CAPABILITY_OPTIONS,
  apiKeyCapabilitySelectionCoverage,
  filterApiKeyCapabilityOptions,
  visibleApiKeyCapabilityCategories,
  type ApiKeyCapabilityOption,
} from "@/lib/api-key-capabilities.shared";
import type { ProductCapabilityId } from "@/lib/capabilities";

type ApiKeyCapabilityPickerProps = {
  name?: string;
  initialSelected?: readonly ProductCapabilityId[];
};

function CapabilityRow({
  option,
  checked,
  onToggle,
}: {
  option: ApiKeyCapabilityOption;
  checked: boolean;
  onToggle: (value: ProductCapabilityId, nextChecked: boolean) => void;
}) {
  return (
    <li className="border-t border-border px-3 py-2.5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          value={option.value}
          checked={checked}
          onChange={(event) => onToggle(option.value, event.target.checked)}
          className="mt-0.5 size-4 rounded-sm border border-primary accent-primary"
          data-scope-value={option.value}
          aria-label={`${option.label}: ${option.description}`}
        />
        <span className="min-w-0" aria-hidden="true">
          <span className="font-mono text-sm text-foreground">{option.label}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {option.description}
          </span>
        </span>
      </label>
    </li>
  );
}

function CapabilityCategorySection({
  category,
  options,
  selected,
  forceOpen,
  onToggle,
}: {
  category: string;
  options: ApiKeyCapabilityOption[];
  selected: ReadonlySet<string>;
  forceOpen: boolean;
  onToggle: (value: ProductCapabilityId, nextChecked: boolean) => void;
}) {
  return (
    <CatalogPickerCategorySection
      category={category}
      count={options.length}
      countLabel={(count) => `${count} ${count === 1 ? "capability" : "capabilities"}`}
      forceOpen={forceOpen}
      panelIdPrefix="api-capability-category"
    >
      <ul>
        {options.map((option) => (
          <CapabilityRow
            key={option.value}
            option={option}
            checked={selected.has(option.value)}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </CatalogPickerCategorySection>
  );
}

export function ApiKeyCapabilityPicker({
  name = "scopes",
  initialSelected = [],
}: ApiKeyCapabilityPickerProps) {
  const [tab, setTab] = useState<CatalogPickerTab>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(initialSelected),
  );

  const trimmedQuery = query.trim();
  const visibleOptions = useMemo(
    () =>
      tab === "selected"
        ? API_KEY_CAPABILITY_OPTIONS.filter((option) => selected.has(option.value))
        : filterApiKeyCapabilityOptions(API_KEY_CAPABILITY_OPTIONS, trimmedQuery),
    [selected, tab, trimmedQuery],
  );
  const categories = useMemo(
    () =>
      visibleApiKeyCapabilityCategories({
        options: API_KEY_CAPABILITY_OPTIONS,
        query: tab === "all" ? trimmedQuery : "",
        tab,
        selected,
      }),
    [selected, tab, trimmedQuery],
  );
  const selectAllState = apiKeyCapabilitySelectionCoverage(visibleOptions, selected);

  function toggleCapability(value: ProductCapabilityId, nextChecked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (nextChecked) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const option of visibleOptions) {
        if (checked) next.add(option.value);
        else next.delete(option.value);
      }
      return next;
    });
  }

  const hiddenFields = [...selected].map((scope) => (
    <input key={scope} type="hidden" name={name} value={scope} />
  ));

  return (
    <CatalogPickerShell
      legend="Capability scopes"
      hint="Required. Keys only access the scopes you select."
      allLabel="All capabilities"
      selectedLabel="Selected capabilities"
      filterGroupAriaLabel="Capability filters"
      selectedCount={selected.size}
      searchQuery={query}
      onSearchQueryChange={setQuery}
      searchPlaceholder="Find capability by name or description…"
      showSearch={tab === "all"}
      searchAriaLabel="Find capability by name or description"
      selectAllState={selectAllState}
      onSelectAllChange={toggleSelectAll}
      selectAllAriaLabel="Select all visible capabilities"
      showSelectAll={visibleOptions.length > 0}
      tab={tab}
      onTabChange={setTab}
      emptyMessage={
        tab === "selected"
          ? "No capabilities selected yet."
          : "No capabilities match your search."
      }
      hasCategories={categories.length > 0}
      hiddenFields={hiddenFields}
    >
      {categories.map(({ category, options }) => (
        <CapabilityCategorySection
          key={category}
          category={category}
          options={options}
          selected={selected}
          forceOpen={trimmedQuery.length > 0 || tab === "selected"}
          onToggle={toggleCapability}
        />
      ))}
    </CatalogPickerShell>
  );
}
