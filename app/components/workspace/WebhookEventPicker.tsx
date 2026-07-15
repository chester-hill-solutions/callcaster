import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CatalogPickerCategorySection,
  CatalogPickerShell,
  type CatalogPickerTab,
} from "@/components/ui/catalog-picker-shell";
import {
  WEBHOOK_EVENT_OPTIONS,
  filterWebhookEventOptions,
  visibleWebhookEventCategories,
  webhookEventSelectionCoverage,
  type WebhookEventOption,
  type WebhookEventOptionValue,
} from "@/lib/webhook-event-options.shared";

type WebhookEventPickerProps = {
  selected: ReadonlySet<string>;
  onSelectedChange: (next: ReadonlySet<string>) => void;
  onTestEvent?: (option: WebhookEventOption) => void;
  testBusy?: boolean;
  canTest?: boolean;
  testDisabledReason?: string;
};

function EventKindRow({
  option,
  checked,
  onToggle,
  onTestEvent,
  testBusy,
  canTest,
}: {
  option: WebhookEventOption;
  checked: boolean;
  onToggle: (value: WebhookEventOptionValue, nextChecked: boolean) => void;
  onTestEvent?: (option: WebhookEventOption) => void;
  testBusy?: boolean;
  canTest?: boolean;
}) {
  const showTest =
    Boolean(onTestEvent) && option.eventType === "INSERT" && checked;

  return (
    <li className="border-t border-border px-3 py-2.5">
      <div className="flex items-start gap-3">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            value={option.value}
            checked={checked}
            onChange={(event) => onToggle(option.value, event.target.checked)}
            className="mt-0.5 size-4 rounded-sm border border-primary accent-primary"
            data-webhook-event={option.value}
            aria-label={`${option.label}: ${option.description}`}
          />
          <span className="min-w-0" aria-hidden="true">
            <span className="text-sm text-foreground">{option.label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {option.description}
            </span>
          </span>
        </label>
        {showTest ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 text-xs"
            onClick={() => onTestEvent?.(option)}
            disabled={testBusy || !canTest}
          >
            Test
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function EventCategorySection({
  category,
  options,
  selected,
  forceOpen,
  onToggle,
  onTestEvent,
  testBusy,
  canTest,
}: {
  category: string;
  options: WebhookEventOption[];
  selected: ReadonlySet<string>;
  forceOpen: boolean;
  onToggle: (value: WebhookEventOptionValue, nextChecked: boolean) => void;
  onTestEvent?: (option: WebhookEventOption) => void;
  testBusy?: boolean;
  canTest?: boolean;
}) {
  return (
    <CatalogPickerCategorySection
      category={category}
      count={options.length}
      countLabel={(count) => `${count} ${count === 1 ? "event" : "events"}`}
      forceOpen={forceOpen}
      panelIdPrefix="webhook-event-category"
    >
      <ul>
        {options.map((option) => (
          <EventKindRow
            key={option.value}
            option={option}
            checked={selected.has(option.value)}
            onToggle={onToggle}
            onTestEvent={onTestEvent}
            testBusy={testBusy}
            canTest={canTest}
          />
        ))}
      </ul>
    </CatalogPickerCategorySection>
  );
}

export function WebhookEventPicker({
  selected,
  onSelectedChange,
  onTestEvent,
  testBusy = false,
  canTest = false,
  testDisabledReason,
}: WebhookEventPickerProps) {
  const [tab, setTab] = useState<CatalogPickerTab>("all");
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const visibleOptions = useMemo(
    () =>
      tab === "selected"
        ? WEBHOOK_EVENT_OPTIONS.filter((option) => selected.has(option.value))
        : filterWebhookEventOptions(WEBHOOK_EVENT_OPTIONS, trimmedQuery),
    [selected, tab, trimmedQuery],
  );
  const categories = useMemo(
    () =>
      visibleWebhookEventCategories({
        options: WEBHOOK_EVENT_OPTIONS,
        query: tab === "all" ? trimmedQuery : "",
        tab,
        selected,
      }),
    [selected, tab, trimmedQuery],
  );
  const selectAllState = webhookEventSelectionCoverage(visibleOptions, selected);

  function toggleEvent(value: WebhookEventOptionValue, nextChecked: boolean) {
    const next = new Set(selected);
    if (nextChecked) next.add(value);
    else next.delete(value);
    onSelectedChange(next);
  }

  function toggleSelectAll(checked: boolean) {
    const next = new Set(selected);
    for (const option of visibleOptions) {
      if (checked) next.add(option.value);
      else next.delete(option.value);
    }
    onSelectedChange(next);
  }

  return (
    <div className="space-y-2">
      <CatalogPickerShell
      legend="Events"
      hint="Choose which workspace events CallCaster should POST to your endpoint."
      allLabel="All events"
      selectedLabel="Selected events"
      filterGroupAriaLabel="Event filters"
      selectedCount={selected.size}
      searchQuery={query}
      onSearchQueryChange={setQuery}
      searchPlaceholder="Find event by name or description…"
      showSearch={tab === "all"}
      searchAriaLabel="Find event by name or description"
      selectAllState={selectAllState}
      onSelectAllChange={toggleSelectAll}
      selectAllAriaLabel="Select all visible events"
      showSelectAll={visibleOptions.length > 0}
      tab={tab}
      onTabChange={setTab}
      emptyMessage={
        tab === "selected" ? "No events selected yet." : "No events match your search."
      }
      hasCategories={categories.length > 0}
      >
        {categories.map(({ category, options }) => (
          <EventCategorySection
            key={category}
            category={category}
            options={options}
            selected={selected}
            forceOpen={trimmedQuery.length > 0 || tab === "selected"}
            onToggle={toggleEvent}
            onTestEvent={onTestEvent}
            testBusy={testBusy}
            canTest={canTest}
          />
        ))}
      </CatalogPickerShell>
      {onTestEvent && !canTest && testDisabledReason ? (
        <p className="text-sm text-muted-foreground" role="status">
          {testDisabledReason}
        </p>
      ) : null}
    </div>
  );
}
