import { ChevronDown, Search } from "lucide-react";
import { useId, useState, type ChangeEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type {
  CatalogPickerSelectionState,
  CatalogPickerTab,
} from "@/lib/catalog-picker.shared";
import { cn } from "@/lib/utils";

export type { CatalogPickerTab, CatalogPickerSelectionState };

export type CatalogPickerShellProps = {
  legend: string;
  hint?: string;
  allLabel?: string;
  selectedLabel?: string;
  filterGroupAriaLabel: string;
  selectedCount: number;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchPlaceholder: string;
  showSearch: boolean;
  searchAriaLabel: string;
  selectAllState: CatalogPickerSelectionState;
  onSelectAllChange: (checked: boolean) => void;
  selectAllLabel?: string;
  selectAllAriaLabel: string;
  showSelectAll: boolean;
  showFilters?: boolean;
  tab: CatalogPickerTab;
  onTabChange: (tab: CatalogPickerTab) => void;
  emptyMessage: string;
  hasCategories: boolean;
  hiddenFields?: ReactNode;
  children: ReactNode;
};

export function CatalogPickerShell({
  legend,
  hint,
  allLabel = "All items",
  selectedLabel = "Selected items",
  filterGroupAriaLabel,
  selectedCount,
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder,
  showSearch,
  searchAriaLabel,
  selectAllState,
  onSelectAllChange,
  selectAllLabel = "Select all",
  selectAllAriaLabel,
  showSelectAll,
  showFilters = true,
  tab,
  onTabChange,
  emptyMessage,
  hasCategories,
  hiddenFields,
  children,
}: CatalogPickerShellProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {hiddenFields}

      {showFilters ? (
        <div
          className="flex gap-4 border-b border-border"
          role="group"
          aria-label={filterGroupAriaLabel}
        >
          <button
            type="button"
            aria-pressed={tab === "all"}
            className={cn(
              "-mb-px border-b-2 pb-2 text-sm transition-colors",
              tab === "all"
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onTabChange("all")}
          >
            {allLabel}
          </button>
          <button
            type="button"
            aria-pressed={tab === "selected"}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2 text-sm transition-colors",
              tab === "selected"
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onTabChange("selected")}
          >
            {selectedLabel}
            {selectedCount > 0 ? (
              <Badge
                variant="default"
                className="px-1.5 py-0 text-[10px]"
                aria-label={`${selectedCount} selected`}
              >
                {selectedCount}
              </Badge>
            ) : null}
          </button>
        </div>
      ) : null}

      {showSearch ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchQuery}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onSearchQueryChange(event.target.value)
            }
            placeholder={searchPlaceholder}
            className="h-9 pl-8"
            aria-label={searchAriaLabel}
          />
        </div>
      ) : null}

      {showSelectAll ? (
        <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-foreground">
          <Checkbox
            checked={
              selectAllState === "all"
                ? true
                : selectAllState === "some"
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(checked) => onSelectAllChange(checked === true)}
            aria-label={selectAllAriaLabel}
          />
          {selectAllLabel}
        </label>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border">
        {hasCategories ? (
          children
        ) : (
          <p className="px-3 py-4 text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </fieldset>
  );
}

export type CatalogPickerCategorySectionProps = {
  category: string;
  count: number;
  countLabel: (count: number) => string;
  forceOpen?: boolean;
  panelIdPrefix?: string;
  children: ReactNode;
};

export function CatalogPickerCategorySection({
  category,
  count,
  countLabel,
  forceOpen = false,
  panelIdPrefix = "catalog-picker-category",
  children,
}: CatalogPickerCategorySectionProps) {
  const [open, setOpen] = useState(true);
  const isOpen = forceOpen || open;
  const reactId = useId();
  const panelId = `${panelIdPrefix}-${category.replace(/\s+/g, "-").toLowerCase()}-${reactId}`;

  return (
    <section className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/40"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 font-medium">{category}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{countLabel(count)}</span>
      </button>
      {isOpen ? <div id={panelId}>{children}</div> : null}
    </section>
  );
}
