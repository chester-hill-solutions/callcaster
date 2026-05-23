import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NumberSearchMode } from "@/lib/numbers-search.server";
import type { FetcherWithComponents } from "react-router";

import {
  SEARCH_DESCRIPTIONS,
  SEARCH_MODE_LABELS,
  SEARCH_PLACEHOLDERS,
} from "./NumberPurchase.constants";
import type { NumbersSearchFetcherData } from "./NumberPurchase";

type NumberPurchaseSearchFormProps = {
  fetcher: FetcherWithComponents<NumbersSearchFetcherData>;
  searchMode: NumberSearchMode;
  onSearchModeChange: (mode: NumberSearchMode) => void;
  query: string;
  onQueryChange: (query: string) => void;
  filterVoice: boolean;
  onFilterVoiceChange: (enabled: boolean) => void;
  filterSms: boolean;
  onFilterSmsChange: (enabled: boolean) => void;
  searchError?: string;
  isSearching: boolean;
  onSubmit: () => void;
};

export function NumberPurchaseSearchForm({
  fetcher,
  searchMode,
  onSearchModeChange,
  query,
  onQueryChange,
  filterVoice,
  onFilterVoiceChange,
  filterSms,
  onFilterSmsChange,
  searchError,
  isSearching,
  onSubmit,
}: NumberPurchaseSearchFormProps) {
  return (
    <fetcher.Form
      action="/api/numbers"
      method="get"
      className="space-y-4 rounded-lg border border-border p-4"
      onSubmit={onSubmit}
    >
      <input type="hidden" name="searchMode" value={searchMode} />
      {filterVoice ? <input type="hidden" name="voice" value="true" /> : null}
      {filterSms ? <input type="hidden" name="sms" value="true" /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Search by" htmlFor="searchMode">
          <Select
            value={searchMode}
            onValueChange={(v) => onSearchModeChange(v as NumberSearchMode)}
          >
            <SelectTrigger id="searchMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SEARCH_MODE_LABELS) as NumberSearchMode[]).map(
                (mode) => (
                  <SelectItem key={mode} value={mode}>
                    {SEARCH_MODE_LABELS[mode]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label={SEARCH_MODE_LABELS[searchMode]}
          htmlFor="query"
          description={SEARCH_DESCRIPTIONS[searchMode]}
          error={searchError}
        >
          <div className="flex gap-2">
            <Input
              id="query"
              name="query"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={SEARCH_PLACEHOLDERS[searchMode]}
              className="flex-1"
            />
            <Button type="submit" disabled={isSearching}>
              {isSearching ? "Searching…" : "Search"}
            </Button>
          </div>
        </FormField>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Checkbox
            id="filterVoice"
            checked={filterVoice}
            onCheckedChange={(c) => onFilterVoiceChange(c === true)}
          />
          <Label htmlFor="filterVoice" className="font-normal">
            Voice enabled
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="filterSms"
            checked={filterSms}
            onCheckedChange={(c) => onFilterSmsChange(c === true)}
          />
          <Label htmlFor="filterSms" className="font-normal">
            SMS enabled
          </Label>
        </div>
      </div>
    </fetcher.Form>
  );
}
