import { DataTable } from "@/components/workspace/tables/DataTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import {
  hasCreditsForNumberRental,
  NUMBER_RENTAL_MONTHLY_CREDITS,
} from "@/lib/number-rental";
import type { NumbersSearchResponse } from "@/lib/numbers-search.server";
import type { AvailableNumber } from "@/routes/workspaces+/$id/settings/numbers.route";
import { Link, useFetcher, type FetcherWithComponents } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { buildNumberPurchaseColumns } from "./NumberPurchase.columns";
import { NumberPurchaseConfirmDialog } from "./NumberPurchase.ConfirmDialog";
import { emptyMessageForMode } from "./NumberPurchase.constants";
import { NumberPurchaseSearchForm } from "./NumberPurchase.SearchForm";
import type { NumberSearchMode } from "@/lib/numbers-search.server";

export type NumbersSearchFetcherData = NumbersSearchResponse | undefined;

export type PurchaseFetcherData = {
  newNumber?: { friendly_name?: string; phone_number?: string };
  creditsError?: boolean;
  error?: string;
};

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

  const columns = useMemo(
    () =>
      buildNumberPurchaseColumns(
        setSelectedNumber,
        purchaseFetcher.state !== "idle",
      ),
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

      <NumberPurchaseSearchForm
        fetcher={fetcher}
        searchMode={searchMode}
        onSearchModeChange={setSearchMode}
        query={query}
        onQueryChange={setQuery}
        filterVoice={filterVoice}
        onFilterVoiceChange={setFilterVoice}
        filterSms={filterSms}
        onFilterSmsChange={setFilterSms}
        searchError={searchError}
        isSearching={isSearching}
        onSubmit={() => setLastQuery(query.trim())}
      />

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

      <NumberPurchaseConfirmDialog
        selectedNumber={selectedNumber}
        onClose={() => setSelectedNumber(null)}
        workspaceId={workspaceId}
        canAfford={canAfford}
        billingLink={billingLink}
        purchaseFetcher={purchaseFetcher}
      />
    </div>
  );
};
