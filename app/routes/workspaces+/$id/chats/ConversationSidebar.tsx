import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { MdAdd } from "react-icons/md";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useInfiniteScroll } from "@/hooks";
import { getChatSortOption } from "@/lib/chat-conversation-sort";
import type { ConversationSummary } from "@/lib/chat-conversation-sort";
import { ALL_CAMPAIGNS_VALUE } from "./conversation-utils";
import { ConversationList } from "./ConversationList";
import type { Campaign, ChatsLoaderData } from "./types";

export type ConversationSidebarProps = {
  campaigns: Campaign[];
  chats: ConversationSummary[];
  chatsError: string | null;
  contactNumber?: string;
  formatDate: (value: string) => string;
  handleExistingConversationClick: (phoneNumber: string) => void;
  onLoadMore: () => void;
  onNewChatClick?: () => void;
  paginationError?: string | null;
  paginationState: ChatsLoaderData["pagination"];
  paginationFetcherState: "idle" | "loading" | "submitting";
  searchParams: URLSearchParams;
  sortBy: string;
  hideStopConversations: boolean;
  onHideStopChange: (checked: boolean) => void;
  updateFilters: (
    updater: (params: URLSearchParams) => URLSearchParams,
  ) => void;
};

export function ConversationSidebar({
  campaigns,
  chats,
  chatsError,
  contactNumber,
  formatDate,
  handleExistingConversationClick,
  onLoadMore,
  onNewChatClick,
  paginationError,
  paginationFetcherState,
  paginationState,
  searchParams,
  sortBy,
  hideStopConversations,
  onHideStopChange,
  updateFilters,
}: ConversationSidebarProps) {
  const [scrollRoot, setScrollRoot] = useState<Element | null>(null);
  const selectedCampaignId = searchParams.get("campaign_id");
  const campaignFilterValue = selectedCampaignId ?? ALL_CAMPAIGNS_VALUE;

  const searchTerm = searchParams.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(searchTerm);

  // Keep the input in sync when the URL search param changes from outside
  // this component (e.g. back/forward navigation).
  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  // Debounce 300ms before pushing the search term into the URL, which is
  // what actually triggers the loader (and the paginated fetcher) to refetch
  // conversations filtered by contact name/phone/last message body.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === searchTerm) return;

    const timeoutId = window.setTimeout(() => {
      updateFilters((nextParams) => {
        if (trimmed) {
          nextParams.set("search", trimmed);
        } else {
          nextParams.delete("search");
        }
        return nextParams;
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput, searchTerm, updateFilters]);

  const [loadMoreRef] = useInfiniteScroll({
    root: scrollRoot,
    hasMore: !contactNumber && paginationState.hasMore,
    loading: paginationFetcherState !== "idle",
    onLoadMore,
    rootMargin: "120px",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Button
        className="flex items-center justify-center rounded-none bg-brand-primary p-3 font-Zilla-Slab text-base font-semibold text-white hover:bg-brand-primary/90"
        asChild
      >
        <NavLink to="." onClick={onNewChatClick}>
          New Chat
          <MdAdd size={24} className="mr-2" />
        </NavLink>
      </Button>
      <div className="flex flex-col gap-2 border-b border-border/70 bg-background/80 p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, phone, or message"
            aria-label="Search conversations"
            className="h-9 pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={campaignFilterValue}
            onValueChange={(value) => {
              updateFilters((nextParams) => {
                if (value === ALL_CAMPAIGNS_VALUE) {
                  nextParams.delete("campaign_id");
                } else {
                  nextParams.set("campaign_id", value);
                }
                return nextParams;
              });
            }}
          >
            <SelectTrigger
              className="h-9 min-w-0 border-border/70 bg-card/60"
              aria-label="Filter by campaign"
            >
              <SelectValue placeholder="Filter by Campaign" />
            </SelectTrigger>
            <SelectContent className="w-full">
              <SelectItem value={ALL_CAMPAIGNS_VALUE} className="w-full">
                All campaigns
              </SelectItem>
              {campaigns?.map((campaign) => (
                <SelectItem
                  value={`${campaign.id}`}
                  key={campaign.id}
                  className="w-full"
                >
                  {campaign.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sortBy}
            onValueChange={(value) => {
              updateFilters((nextParams) => {
                const nextSort = getChatSortOption(value);

                if (nextSort === "recent") {
                  nextParams.delete("sort");
                } else {
                  nextParams.set("sort", nextSort);
                }

                return nextParams;
              });
            }}
          >
            <SelectTrigger
              className="h-9 min-w-0 border-border/70 bg-card/60"
              aria-label="Sort chats"
            >
              <SelectValue placeholder="Sort chats" />
            </SelectTrigger>
            <SelectContent className="w-full">
              <SelectItem value="recent">Recent activity</SelectItem>
              <SelectItem value="hasReplied">Has replied</SelectItem>
              <SelectItem value="hasUnreadReply">Has unread reply</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Hide STOP-only</span>
            <Switch
              checked={hideStopConversations}
              onCheckedChange={onHideStopChange}
              aria-label="Hide conversations whose last reply is STOP/opt-out"
            />
          </div>
          <Button
            type="reset"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() =>
              updateFilters((nextParams) => {
                nextParams.delete("campaign_id");
                return nextParams;
              })
            }
          >
            <X className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>
      <div
        ref={(el) => setScrollRoot(el)}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {chatsError ? (
          <p className="border-b px-4 py-2 text-sm text-red-500">{chatsError}</p>
        ) : null}
        <ConversationList
          chats={chats}
          contactNumber={contactNumber}
          handleExistingConversationClick={handleExistingConversationClick}
          formatDate={formatDate}
        />
        {paginationError ? (
          <p className="px-4 py-2 text-sm text-red-500">{paginationError}</p>
        ) : null}
        {paginationState.hasMore ? (
          <div
            ref={loadMoreRef}
            className="flex items-center justify-center gap-2 px-4 py-3 text-center text-sm text-muted-foreground"
          >
            {paginationFetcherState === "idle" ? (
              "Load more chats"
            ) : (
              <>
                <Spinner className="h-4 w-4" />
                Loading more chats...
              </>
            )}
          </div>
        ) : chats.length > 0 ? (
          <div className="px-4 py-3 text-center text-sm text-muted-foreground">
            All chats loaded
          </div>
        ) : null}
      </div>
    </div>
  );
}
