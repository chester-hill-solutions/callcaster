import { DataTable } from "@/components/workspace/tables/DataTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Text } from "@/components/ui/typography";
import {
  hasCreditsForNumberRental,
  NUMBER_RENTAL_MONTHLY_CREDITS,
  numberRentalConfirmCopy,
  numberRentalPriceLabel,
} from "@/lib/number-rental";
import type { NumberSearchMode } from "@/lib/numbers-search.server";
import type { NumbersSearchResponse } from "@/lib/numbers-search.server";
import type { AvailableNumber } from "@/routes/workspaces+/$id/settings/numbers.route";
import { FetcherWithComponents, Link, NavLink, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type NumbersSearchFetcherData = NumbersSearchResponse | undefined;

type PurchaseFetcherData = {
  newNumber?: { friendly_name?: string; phone_number?: string };
  creditsError?: boolean;
  error?: string;
};

const SEARCH_MODE_LABELS: Record<NumberSearchMode, string> = {
  areaCode: "Area code",
  province: "Province",
  city: "City",
  postalCode: "Postal code",
  contains: "Number pattern",
};

const SEARCH_PLACEHOLDERS: Record<NumberSearchMode, string> = {
  areaCode: "e.g. 416",
  province: "e.g. ON",
  city: "e.g. Toronto",
  postalCode: "e.g. M5H or M5H 2N2",
  contains: "e.g. +416555",
};

const SEARCH_DESCRIPTIONS: Record<NumberSearchMode, string> = {
  areaCode: "3-digit Canadian area code (NPA).",
  province: "2-letter province or territory code.",
  city: "City or locality name in Canada.",
  postalCode: "Canadian postal code (FSA or full).",
  contains:
    "Match digits in the number (2–16 characters; Twilio pattern rules apply).",
};

function emptyMessageForMode(mode: NumberSearchMode, query: string): string {
  switch (mode) {
    case "areaCode":
      return `No numbers found for area code ${query}.`;
    case "province":
      return `No numbers found in ${query.toUpperCase()}.`;
    case "city":
      return `No numbers found near ${query}.`;
    case "postalCode":
      return `No numbers found for postal code ${query}.`;
    case "contains":
      return `No numbers matched pattern "${query}".`;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function capabilityBadges(capabilities: Record<string, boolean>) {
  const entries = Object.entries(capabilities).filter(
    ([key, enabled]) =>
      enabled && ["voice", "sms", "mms", "fax"].includes(key),
  );
  if (entries.length === 0) {
    return <Text variant="muted">—</Text>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([cap]) => (
        <Badge key={cap} variant="secondary" className="text-xs uppercase">
          {cap}
        </Badge>
      ))}
    </div>
  );
}

export const NumberPurchase = ({
  fetcher,
  workspaceId,
  creditsBalance,
  billingLink = "../../billing",
}: {
  fetcher: FetcherWithComponents<NumbersSearchFetcherData>;
  workspaceId: string;
  creditsBalance: number;
  billingLink?: string;
}) => {
  const purchaseFetcher = useFetcher<PurchaseFetcherData>();
  const [searchMode, setSearchMode] = useState<NumberSearchMode>("areaCode");
  const [query, setQuery] = useState("");
  const [filterVoice, setFilterVoice] = useState(false);
  const [filterSms, setFilterSms] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<AvailableNumber | null>(
    null,
  );
  const [lastQuery, setLastQuery] = useState("");

  const canAfford = hasCreditsForNumberRental(creditsBalance);
  const isSearching = fetcher.state !== "idle";
  const searchData = fetcher.data;
  const searchResults: AvailableNumber[] =
    searchData?.ok === true ? searchData.numbers : [];
  const searchError =
    searchData?.ok === false ? searchData.error : undefined;
  const hasSearched = searchData !== undefined;

  const purchaseComplete =
    purchaseFetcher.state === "idle" &&
    Boolean(purchaseFetcher.data?.newNumber);

  useEffect(() => {
    if (purchaseComplete) {
      const purchased = purchaseFetcher.data?.newNumber;
      toast.success(
        `Number purchased: ${purchased?.friendly_name ?? purchased?.phone_number ?? "New number"}`,
      );
      setSelectedNumber(null);
    }
  }, [purchaseComplete, purchaseFetcher.data?.newNumber]);

  useEffect(() => {
    if (purchaseFetcher.data?.error && purchaseFetcher.state === "idle") {
      toast.error(purchaseFetcher.data.error);
    }
  }, [purchaseFetcher.data?.error, purchaseFetcher.state]);

  const columns = useMemo<ColumnDef<AvailableNumber>[]>(
    () => [
      {
        accessorKey: "friendlyName",
        header: "Name",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.friendlyName}</span>
        ),
      },
      {
        accessorKey: "phoneNumber",
        header: "Number",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.phoneNumber}</span>
        ),
      },
      {
        id: "location",
        header: "Location",
        cell: ({ row }) => {
          const parts = [
            row.original.locality,
            row.original.region,
          ].filter(Boolean);
          return (
            <span className="text-sm text-muted-foreground">
              {parts.length > 0 ? parts.join(", ") : "—"}
            </span>
          );
        },
      },
      {
        id: "capabilities",
        header: "Capabilities",
        cell: ({ row }) => capabilityBadges(row.original.capabilities),
      },
      {
        id: "price",
        header: "Price",
        cell: () => (
          <span className="text-sm whitespace-nowrap">
            {numberRentalPriceLabel()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            disabled={purchaseFetcher.state !== "idle"}
            onClick={() => setSelectedNumber(row.original)}
          >
            Purchase
          </Button>
        ),
      },
    ],
    [purchaseFetcher.state],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Text variant="muted">
          Search Canadian local numbers and rent one for your workspace.
        </Text>
        <Alert variant={canAfford ? "default" : "destructive"}>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Balance: <strong>{creditsBalance}</strong> credits · Rent:{" "}
              <strong>{NUMBER_RENTAL_MONTHLY_CREDITS}</strong> credits per
              30-day period
            </span>
            {!canAfford ? (
              <Button size="sm" variant="outline" asChild>
                <Link to={billingLink} relative="path">
                  Buy credits
                </Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      </div>

      <fetcher.Form
        action="/api/numbers"
        method="get"
        className="space-y-4 rounded-lg border border-border p-4"
        onSubmit={() => setLastQuery(query.trim())}
      >
        <input type="hidden" name="searchMode" value={searchMode} />
        {filterVoice ? (
          <input type="hidden" name="voice" value="true" />
        ) : null}
        {filterSms ? <input type="hidden" name="sms" value="true" /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Search by" htmlFor="searchMode">
            <Select
              value={searchMode}
              onValueChange={(v) => setSearchMode(v as NumberSearchMode)}
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
                onChange={(e) => setQuery(e.target.value)}
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
              onCheckedChange={(c) => setFilterVoice(c === true)}
            />
            <Label htmlFor="filterVoice" className="font-normal">
              Voice enabled
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="filterSms"
              checked={filterSms}
              onCheckedChange={(c) => setFilterSms(c === true)}
            />
            <Label htmlFor="filterSms" className="font-normal">
              SMS enabled
            </Label>
          </div>
        </div>
      </fetcher.Form>

      <DataTable
        columns={columns}
        data={searchResults}
        isLoading={isSearching}
        emptyState={
          hasSearched && !searchError ? (
            <Text variant="muted" className="py-8 text-center">
              {lastQuery
                ? emptyMessageForMode(searchMode, lastQuery)
                : "No results."}
            </Text>
          ) : (
            <Text variant="muted" className="py-8 text-center">
              Choose a search type and run a search for Canadian local numbers.
            </Text>
          )
        }
      />

      <Dialog
        open={selectedNumber !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedNumber(null);
        }}
      >
        <DialogContent className="bg-card sm:max-w-md">
          {selectedNumber ? (
            <purchaseFetcher.Form method="POST" action="/api/numbers">
              <DialogHeader>
                <DialogTitle>Confirm purchase</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <Text>
                  {selectedNumber.friendlyName} ({selectedNumber.phoneNumber})
                </Text>
                <Text variant="muted" className="text-sm">
                  {numberRentalConfirmCopy()}
                </Text>
                <input
                  type="hidden"
                  name="phoneNumber"
                  value={selectedNumber.phoneNumber}
                  readOnly
                />
                <input
                  type="hidden"
                  name="workspace_id"
                  value={workspaceId}
                />
                {purchaseFetcher.data?.creditsError ? (
                  <Text className="text-sm text-destructive">
                    You do not have enough credits to purchase this number.
                  </Text>
                ) : null}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <DialogClose asChild>
                  <Button variant="outline" type="button">
                    Cancel
                  </Button>
                </DialogClose>
                {purchaseFetcher.data?.creditsError ? (
                  <Button asChild>
                    <NavLink to={billingLink} relative="path">
                      Buy credits
                    </NavLink>
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      !canAfford || purchaseFetcher.state !== "idle"
                    }
                  >
                    {purchaseFetcher.state !== "idle"
                      ? "Purchasing…"
                      : "Purchase"}
                  </Button>
                )}
              </DialogFooter>
            </purchaseFetcher.Form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
