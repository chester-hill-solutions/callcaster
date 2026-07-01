import { DataTable } from "@/components/workspace/tables/DataTable";
import { Text } from "@/components/ui/typography";
import { hasCreditsForNumberRental } from "@/lib/number-rental";
import type { AvailableNumber } from "@/components/phone-numbers/NumberPurchase.constants";
import { useFetcher, type FetcherWithComponents } from "react-router";
import { useMemo, useState } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

import { buildNumberPurchaseColumns } from "./NumberPurchase.columns";
import { NumberPurchaseConfirmDialog } from "./NumberPurchase.ConfirmDialog";
import { NumberRentalCreditsAlert } from "./NumberRentalCreditsAlert";
import {
  emptyMessageForMode,
  type NumbersSearchFetcherData,
  type PurchaseFetcherData,
} from "./NumberPurchase.constants";
import { NumberPurchaseSearchForm } from "./NumberPurchase.SearchForm";
import type { NumberSearchMode } from "@/lib/numbers-search.server";

export type { NumbersSearchFetcherData, PurchaseFetcherData };

export const NumberPurchase = ({
  fetcher,
  workspaceId,
  creditsBalance,
  billingLink = "../../billing",
  onPurchaseComplete,
}: {
  fetcher: FetcherWithComponents<NumbersSearchFetcherData>;
  workspaceId: string;
  creditsBalance: number;
  billingLink?: string;
  onPurchaseComplete?: () => void;
}) => {
  const purchaseFetcher = useFetcher<PurchaseFetcherData>();
  const [searchMode, setSearchMode] = useState<NumberSearchMode>("areaCode");
  const [query, setQuery] = useState("");
  const [filterVoice, setFilterVoice] = useState(false);
  const [filterSms, setFilterSms] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<AvailableNumber | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  const canAfford = hasCreditsForNumberRental(creditsBalance);
  const isSearching = fetcher.state !== "idle";
  const searchData = fetcher.data;
  const searchResults: AvailableNumber[] =
    searchData?.ok === true ? searchData.numbers : [];
  const searchError =
    searchData?.ok === false ? searchData.error : undefined;
  const hasSearched = searchData !== undefined;

  useActionFeedback(
    purchaseFetcher.state === "idle" ? purchaseFetcher.data : undefined,
    {
      getWarning: (data) =>
        data?.partialSuccess && data.messagingServiceAttachError
          ? data.messagingServiceAttachError
          : undefined,
      warningMessage: (data) => {
        const purchased = data?.newNumber;
        return `Number purchased (${purchased?.phone_number ?? "new number"}), but it was not added to the Messaging Service sender pool. Retry provisioning from workspace onboarding or contact an admin.`;
      },
      getSuccess: (data) => Boolean(data?.newNumber),
      successMessage: (data) => {
        const purchased = data?.newNumber;
        return `Number purchased: ${purchased?.friendly_name ?? purchased?.phone_number ?? "New number"}`;
      },
      getError: (data) => data?.error,
      onSuccess: () => {
        setSelectedNumber(null);
        onPurchaseComplete?.();
      },
    },
  );

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
        <NumberRentalCreditsAlert
          creditsBalance={creditsBalance}
          billingLink={billingLink}
        />
      </div>

      <NumberPurchaseSearchForm
        fetcher={fetcher}
        workspaceId={workspaceId}
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
