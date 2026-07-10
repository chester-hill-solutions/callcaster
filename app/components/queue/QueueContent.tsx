import { Audience, CampaignQueue, Contact, Queue, QueueItem } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { QueueHeader } from "./QueueHeader";
import { QueueTable } from "@/components/queue/QueueTable";

interface QueueContentProps {
  client?: unknown;
  queueValue: {
    queueData: QueueItem[] | null;
    queueError: Error | null;
    totalCount: number | null;
    unfilteredCount: number | null;
    currentPage: number;
    pageSize: number;
    filters: {
      name: string;
      phone: string;
      email: string;
      address: string;
      audiences: string;
      disposition: string;
      queueStatus: string;
    };
  };
  handleFilterChange: (key: string, value: string) => void;
  clearFilter: () => void;
  audiences: Audience[];
  isSelectingAudience: boolean;
  selectedAudience: number | null;
  setIsSelectingAudience: (value: boolean) => void;
  setSelectedAudience: (value: number | null) => void;
  handleAddFromAudience: (value: number) => void;
  handleAddContact: () => void;
  onStatusChange: (ids: string[], newStatus: string) => void;
  isAllFilteredSelected: boolean;
  setIsAllFilteredSelected: (value: boolean) => void;
  addContactToQueue: (contact: (Contact & { contact_audience: { audience_id: number }[] })[]) => void;
  removeContactsFromQueue: (ids: string[] | 'all') => void;
  selectedAudienceIds: number[];
  campaignId: string;
  queueFetcher: ReturnType<typeof import("react-router").useFetcher>;
}

export function QueueContent({
    queueValue,
    handleFilterChange,
    clearFilter,
    audiences,
    isSelectingAudience,
    selectedAudience,
    setIsSelectingAudience,
    setSelectedAudience,
    handleAddFromAudience,
    handleAddContact,
    onStatusChange,
    isAllFilteredSelected,
    setIsAllFilteredSelected,
    addContactToQueue,
    removeContactsFromQueue,
        selectedAudienceIds,
    campaignId,
    queueFetcher,
}: QueueContentProps) {
    if (queueValue?.queueError) {
        return (
            <div className="p-2">
                <Alert variant="destructive">
                    <AlertTitle>Queue unavailable</AlertTitle>
                    <AlertDescription>
                        The call queue failed to load. Refresh the page to try again.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="p-2">
            <QueueHeader
                unfilteredCount={queueValue.unfilteredCount ?? 0}
                totalCount={queueValue.totalCount ?? 0}
                isSelectingAudience={isSelectingAudience}
                selectedAudience={selectedAudience}
                audiences={audiences}
                selectedCampaignAudienceIds={selectedAudienceIds}
                onSelectingAudienceChange={setIsSelectingAudience}
                onSelectedAudienceChange={setSelectedAudience}
                onAddFromAudience={handleAddFromAudience}
                onAddContact={handleAddContact}
            />
            <QueueTable
                unfilteredCount={queueValue.unfilteredCount ?? 0}
                handleFilterChange={handleFilterChange}
                queue={queueValue.queueData ?? []}
                audiences={audiences}
                totalCount={queueValue.totalCount}
                currentPage={queueValue.currentPage}
                pageSize={queueValue.pageSize}
                defaultFilters={queueValue.filters}
                onStatusChange={onStatusChange}
                isAllFilteredSelected={isAllFilteredSelected}
                onSelectAllFiltered={setIsAllFilteredSelected}
                addContactToQueue={addContactToQueue}
                removeContactsFromQueue={removeContactsFromQueue}
                clearFilter={clearFilter}
                queueFetcher={queueFetcher}
            />
        </div>
    );
} 