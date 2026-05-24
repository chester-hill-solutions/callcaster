import { useState } from "react";
import { NavLink } from "react-router";
import { MdAdd } from "react-icons/md";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        className="flex items-center justify-center rounded-none bg-brand-primary p-4 font-Zilla-Slab text-base font-semibold text-white hover:bg-brand-primary/90"
        asChild
      >
        <NavLink to="." onClick={onNewChatClick}>
          New Chat
          <MdAdd size={24} className="mr-2" />
        </NavLink>
      </Button>
      <div className="flex items-center border-b border-border/70 bg-background/80 p-2">
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
          <SelectTrigger className="flex items-center border-border/70 bg-card/60 p-2">
            <SelectValue placeholder="Filter by Campaign" />
          </SelectTrigger>
          <SelectContent className="w-full">
            <SelectItem value={ALL_CAMPAIGNS_VALUE} className="w-full p-4">
              All campaigns
            </SelectItem>
            {campaigns?.map((campaign) => (
              <SelectItem
                value={`${campaign.id}`}
                key={campaign.id}
                className="w-full p-4"
              >
                {campaign.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="reset"
          variant="ghost"
          onClick={() =>
            updateFilters((nextParams) => {
              nextParams.delete("campaign_id");
              return nextParams;
            })
          }
        >
          <X />
        </Button>
      </div>
      <div className="border-b border-border/70 p-2">
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
          <SelectTrigger className="flex items-center border-border/70 bg-card/60">
            <SelectValue placeholder="Sort chats" />
          </SelectTrigger>
          <SelectContent className="w-full">
            <SelectItem value="recent">Recent activity</SelectItem>
            <SelectItem value="hasReplied">Has replied</SelectItem>
            <SelectItem value="hasUnreadReply">Has unread reply</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <span className="text-sm font-medium">Hide STOP-only</span>
        <Switch
          checked={hideStopConversations}
          onCheckedChange={onHideStopChange}
          aria-label="Hide conversations whose last reply is STOP/opt-out"
        />
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
            className="px-4 py-3 text-center text-sm text-muted-foreground"
          >
            {paginationFetcherState === "idle"
              ? "Load more chats"
              : "Loading more chats..."}
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
