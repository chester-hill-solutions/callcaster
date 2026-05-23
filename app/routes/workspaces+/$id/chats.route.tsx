export { loader } from "./chats.loader.server";
export { action } from "./chats.action.server";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect } from "react-router";
import { NavLink, Outlet, useFetcher, useLoaderData, useLocation, useNavigate, useOutlet, useOutletContext, useParams, useSearchParams, useRouteError } from "react-router";
import { MdAdd, MdChat } from "react-icons/md";
import { Button } from "@/components/ui/button";


import { isOptOutMessage, parseOptOutKeywords } from "@/lib/chat-opt-out";

import { formatMessageTimestamp, normalizePhoneNumber } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader as MobileSheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { phoneNumbersMatch } from "@/hooks/realtime/useChatRealtime";
import { useInfiniteScroll } from "@/hooks";
import ChatHeader from "@/components/sms-ui/ChatHeader";
import ChatInput from "@/components/sms-ui/ChatInput";
import ChatAddContactDialog from "@/components/sms-ui/ChatAddContactDialog";
import { useContactSearch } from "@/hooks/contact/useContactSearch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";
import type {
  User,
  Contact,
  Workspace,
  BaseUser,
  WorkspaceNumber,
} from "@/lib/types";
import { logger } from "@/lib/logger.client";
import { useSupabaseRealtimeSubscription } from "@/hooks/realtime/useSupabaseRealtime";
import {
  getConversationParticipantPhones,
  getChatSortOption,
  isInboundMessageDirection,
  normalizeConversationPhone,
  sortConversationSummaries,
  type ConversationSummary,
} from "@/lib/chat-conversation-sort";

export default function ChatsList() {
  const { supabase, workspace } = useOutletContext<WorkspaceContextType>();
  const {
    chats,
    chatsError,
    pagination,
    potentialContacts,
    contact,
    campaigns,
    workspaceNumbers,
    optOutKeywords,
  } = useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  // Keep in state so toggling doesn't trigger loader re-run (setSearchParams causes full navigation)
  const [hideStopConversations, setHideStopConversations] = useState(
    () => searchParams.get("hide_stop") === "1",
  );
  useEffect(() => {
    setHideStopConversations(searchParams.get("hide_stop") === "1");
  }, [searchParams]);
  const messageFetcher = useFetcher({ key: "messages" });
  const paginationFilterKey = useMemo(() => {
    const campaignFilter = searchParams.get("campaign_id") ?? ALL_CAMPAIGNS_VALUE;
    const sortFilter = getChatSortOption(searchParams.get("sort"));
    return `${campaignFilter}:${sortFilter}`;
  }, [searchParams]);
  const paginationFetcher = useFetcher<LoaderData>({
    key: `chat-pages-${workspace.id}-${paginationFilterKey}`,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const chatActionsRef = useRef<{
    addOptimisticMessage?: (p: {
      body: string;
      from: string;
      to: string;
      media?: string;
    }) => void;
  } | null>(null);
  const requestedPageRef = useRef(pagination.page);
  const registerChatActions = useCallback(
    (actions: typeof chatActionsRef.current) => {
      chatActionsRef.current = actions;
    },
    [],
  );
  const [dialogContact, setDialog] = useState<Contact | null>(null);
  const [isMobileConversationListOpen, setIsMobileConversationListOpen] =
    useState(false);
  const outlet = useOutlet();
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const contact_number = params["contact_number"] ?? "";
  const formatDate = formatMessageTimestamp;
  const sortBy = getChatSortOption(searchParams.get("sort"));
  const [loadedChats, setLoadedChats] = useState<ConversationSummary[]>(chats);
  const [paginationState, setPaginationState] = useState(pagination);
  const workspacePhoneKeys = useMemo(
    () => getWorkspacePhoneKeys(workspaceNumbers),
    [workspaceNumbers],
  );
  const chatInputWorkspaceNumbers = useMemo(
    () =>
      workspaceNumbers
        .filter((workspaceNumber): workspaceNumber is RouteWorkspaceNumber =>
          Boolean(workspaceNumber.phone_number),
        )
        .map((workspaceNumber) => ({
          id: String(workspaceNumber.id),
          phone_number: workspaceNumber.phone_number ?? "",
        })),
    [workspaceNumbers],
  );
  const chatsRoutePath = `/workspaces/${workspace.id}/chats`;
  const closeMobileConversationList = useCallback(() => {
    setIsMobileConversationListOpen(false);
  }, []);

  useEffect(() => {
    setLoadedChats(chats);
    setPaginationState(pagination);
    requestedPageRef.current = pagination.page;
  }, [chats, pagination]);

  useEffect(() => {
    if (!paginationFetcher.data) {
      return;
    }

    setLoadedChats((currentChats) =>
      mergeConversationPages(currentChats, paginationFetcher.data?.chats ?? []),
    );
    setPaginationState(paginationFetcher.data.pagination);
    requestedPageRef.current = paginationFetcher.data.pagination.page;
  }, [paginationFetcher.data]);

  const displayedChats = useMemo(() => {
    let filteredAndSortedChats = sortConversationSummaries(loadedChats, sortBy);
    if (hideStopConversations) {
      filteredAndSortedChats = filteredAndSortedChats.filter(
        (chat) =>
          !isOptOutMessage(chat.last_inbound_body ?? null, optOutKeywords),
      );
    }
    return filteredAndSortedChats;
  }, [loadedChats, sortBy, hideStopConversations, optOutKeywords]);

  // Custom hooks for images
  const {
    selectedImages,
    setSelectedImages,
    handleImageSelect,
    handleImageRemove,
  } = useImageHandling(workspace.id);

  // Contact search hook with consolidated functionality
  const {
    selectedContact,
    isContactMenuOpen,
    searchError,
    contacts,
    phoneNumber,
    existingConversation,
    handleSearch: handlePhoneChange,
    toggleContactMenu,
    isValid,
  } = useContactSearch({
    supabase,
    workspace_id: workspace.id,
    contact_number,
    potentialContacts,
    dropdownRef,
    initialContact: contact,
  });

  // Navigate away if phone number is invalid (decode in case path segment is encoded, e.g. %2B).
  // Only when outlet is present (viewing a conversation) and skip while sidebar pagination is
  // loading to avoid redirect races from fetcher revalidation.
  useEffect(() => {
    if (!outlet || paginationFetcher.state !== "idle") return;
    const decoded = contact_number ? decodeURIComponent(contact_number) : "";
    if (decoded && !phoneRegex.test(decoded)) {
      navigate(".");
    }
  }, [contact_number, navigate, outlet, paginationFetcher.state]);

  useSupabaseRealtimeSubscription({
    supabase,
    table: "message",
    filter: `workspace=eq.${workspace.id}`,
    onChange: (payload) => {
      const typedPayload = payload as RealtimePostgresChangesPayload<
        Tables<"message">
      >;
      const selectedCampaignId = searchParams.get("campaign_id");
      const nextRow = typedPayload.new as Tables<"message"> | null;

      if (!nextRow) {
        return;
      }

      if (
        selectedCampaignId &&
        Number(nextRow.campaign_id) !== Number(selectedCampaignId)
      ) {
        return;
      }

      if (typedPayload.eventType === "INSERT") {
        setLoadedChats((currentChats) =>
          upsertConversationFromMessage({
            currentChats,
            message: nextRow,
            activeContactNumber: contact_number,
            workspacePhoneKeys,
          }),
        );
        return;
      }

      if (typedPayload.eventType !== "UPDATE") {
        return;
      }

      if (nextRow.status !== "delivered" && nextRow.status !== "read") {
        return;
      }

      const { contactPhone } = getConversationParticipantPhones(
        {
          from: nextRow.from,
          to: nextRow.to,
          direction: nextRow.direction,
        },
        workspacePhoneKeys,
      );

      if (!contactPhone) {
        return;
      }

      setLoadedChats((currentChats) =>
        currentChats.map((chat) =>
          phoneNumbersMatch(chat.contact_phone, contactPhone)
            ? { ...chat, unread_count: 0 }
            : chat,
        ),
      );
    },
  });

  const handleLoadMore = useCallback(() => {
    if (paginationFetcher.state !== "idle" || !paginationState.hasMore) {
      return;
    }

    const nextPage = paginationState.page + 1;
    if (requestedPageRef.current >= nextPage) {
      return;
    }

    requestedPageRef.current = nextPage;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("page", String(nextPage));
    nextSearchParams.set("pageSize", String(paginationState.pageSize));
    paginationFetcher.load(`${chatsRoutePath}?${nextSearchParams.toString()}`);
  }, [
    chatsRoutePath,
    paginationFetcher,
    paginationState.hasMore,
    paginationState.page,
    paginationState.pageSize,
    searchParams,
  ]);

  // Form submission handler
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const target = e.currentTarget;
      const toNumber = contact_number || phoneNumber;
      if (!toNumber || messageFetcher.state !== "idle") return;

      const formData = new FormData(target);
      formData.append("media", JSON.stringify(selectedImages));
      const body = (formData.get("body") as string) || "";
      const from =
        (formData.get("from") as string) ||
        workspaceNumbers?.[0]?.phone_number ||
        "";
      const media = formData.get("media") as string | undefined;
      chatActionsRef.current?.addOptimisticMessage?.({
        body,
        from,
        to: toNumber,
        media,
      });

      messageFetcher.submit(formData, { method: "POST" });

      const messageBody =
        target.querySelector<HTMLInputElement>("#body") ||
        target.querySelector<HTMLTextAreaElement>("#body");
      if (messageBody) messageBody.value = "";
      setSelectedImages([]);
    },
    [
      contact_number,
      phoneNumber,
      messageFetcher,
      selectedImages,
      setSelectedImages,
      workspaceNumbers,
    ],
  );

  // Enhanced contact selection handler with read status update
  const handleContactSelect = useCallback(
    (contact: Contact) => {
      const number = normalizePhoneNumber(contact.phone || "");
      if (number) {
        closeMobileConversationList();
        navigate(`./${number}`);
        setLoadedChats((currentChats) =>
          currentChats.map((chat) =>
            phoneNumbersMatch(chat.contact_phone, number)
              ? { ...chat, unread_count: 0 }
              : chat,
          ),
        );

        supabase
          .from("message")
          .update({ status: "delivered" })
          .eq("workspace", workspace.id)
          .eq("status", "received")
          .or(`from.eq.${number},to.eq.${number}`)
          .then(
            ({ error }) => {
              if (error) {
                logger.error("Error marking messages as read:", error);
              } else {
                window.dispatchEvent(
                  new CustomEvent("messages-read", {
                    detail: { contactNumber: number },
                  }),
                );
              }
            },
            (err: unknown) =>
              logger.error("Error marking messages as read:", err),
          );
      }
      return null;
    },
    [closeMobileConversationList, navigate, supabase, workspace.id],
  );

  const handleExistingConversationClick = useCallback(
    (phoneNumber: string) => {
      closeMobileConversationList();
      const search = new URLSearchParams(searchParams);
      if (hideStopConversations) search.set("hide_stop", "1");
      else search.delete("hide_stop");
      const query = search.toString();
      const path = `./${encodeURIComponent(phoneNumber)}`;
      navigate(query ? `${path}?${query}` : path);

      setLoadedChats((currentChats) =>
        currentChats.map((chat) =>
          phoneNumbersMatch(chat.contact_phone, phoneNumber)
            ? { ...chat, unread_count: 0 }
            : chat,
        ),
      );

      supabase
        .from("message")
        .update({ status: "delivered" })
        .eq("workspace", workspace.id)
        .eq("status", "received")
        .or(`from.eq.${phoneNumber},to.eq.${phoneNumber}`)
        .then(
          ({ error }) => {
            if (error) {
              logger.error("Error marking messages as read:", error);
            } else {
              window.dispatchEvent(
                new CustomEvent("messages-read", {
                  detail: { contactNumber: phoneNumber },
                }),
              );
            }
          },
          (err: unknown) =>
            logger.error("Error marking messages as read:", err),
        );
    },
    [
      closeMobileConversationList,
      navigate,
      searchParams,
      hideStopConversations,
      supabase,
      workspace.id,
    ],
  );

  // Adapter functions to match ChatHeader's expected types
  // use the handler directly since it already matches the expected signature

  const toggleContactMenuAdapter = useCallback(() => {
    toggleContactMenu();
    return null;
  }, [toggleContactMenu]);

  const handleContactSelectAdapter = useCallback(
    (contact: Contact) => {
      handleContactSelect(contact);
      return null;
    },
    [handleContactSelect],
  );

  const handleExistingConversationClickAdapter = useCallback(
    (phoneNumber: string) => {
      handleExistingConversationClick(phoneNumber);
      return null;
    },
    [handleExistingConversationClick],
  );

  useEffect(() => {
    const handleMessageRead = (event: Event) => {
      const customEvent = event as CustomEvent<{ contactNumber?: string }>;
      const contactNumber = customEvent.detail?.contactNumber;

      if (!contactNumber) {
        return;
      }

      setLoadedChats((currentChats) =>
        currentChats.map((chat) =>
          phoneNumbersMatch(chat.contact_phone, contactNumber)
            ? { ...chat, unread_count: 0 }
            : chat,
        ),
      );
    };

    window.addEventListener("message-read", handleMessageRead);
    window.addEventListener("messages-read", handleMessageRead);

    return () => {
      window.removeEventListener("message-read", handleMessageRead);
      window.removeEventListener("messages-read", handleMessageRead);
    };
  }, []);

  const updateFilters = useCallback(
    (updater: (params: URLSearchParams) => URLSearchParams) => {
      setSearchParams((previousParams) => {
        const nextParams = updater(new URLSearchParams(previousParams));
        nextParams.delete("page");
        return nextParams;
      });
    },
    [setSearchParams],
  );

  const handleHideStopChange = useCallback((checked: boolean) => {
    setHideStopConversations(checked);
    // Update URL without triggering loader (replaceState = no Remix navigation)
    const url = new URL(window.location.href);
    if (checked) url.searchParams.set("hide_stop", "1");
    else url.searchParams.delete("hide_stop");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  const handleNewChatClick = useCallback(() => {
    closeMobileConversationList();
  }, [closeMobileConversationList]);

  return (
    <main className="flex min-h-[68vh] w-full flex-col gap-4 md:flex-row">
      <Card className="flex h-[68vh] max-h-[68vh] hidden flex-col overflow-hidden border-border/80 bg-card/80 md:flex md:max-w-[40%] md:basis-2/5">
        <ConversationSidebar
          campaigns={campaigns}
          chats={displayedChats}
          chatsError={chatsError}
          contactNumber={contact_number}
          formatDate={formatDate}
          handleExistingConversationClick={handleExistingConversationClick}
          hideStopConversations={hideStopConversations}
          onHideStopChange={handleHideStopChange}
          onLoadMore={handleLoadMore}
          onNewChatClick={handleNewChatClick}
          optOutKeywords={optOutKeywords}
          paginationError={paginationFetcher.data?.chatsError ?? null}
          paginationFetcherState={paginationFetcher.state}
          paginationState={paginationState}
          searchParams={searchParams}
          sortBy={sortBy}
          updateFilters={updateFilters}
        />
      </Card>

      <Card className="flex min-h-[68vh] w-full min-w-0 flex-1 flex-col overflow-hidden border-border/80 bg-card/80 md:basis-3/5">
        <ChatHeader
          contact={contact}
          outlet={Boolean(outlet)}
          potentialContacts={potentialContacts}
          phoneNumber={phoneNumber}
          contactNumber={contact_number}
          handlePhoneChange={handlePhoneChange}
          isValid={isValid}
          selectedContact={selectedContact}
          contacts={contacts}
          toggleContactMenu={toggleContactMenuAdapter}
          isContactMenuOpen={isContactMenuOpen}
          handleContactSelect={handleContactSelectAdapter}
          dropdownRef={dropdownRef}
          searchError={searchError || undefined}
          existingConversation={existingConversation as unknown as Chat}
          handleExistingConversationClick={
            handleExistingConversationClickAdapter
          }
          setDialog={(nextContact: Partial<Contact>) =>
            setDialog(nextContact as Contact)
          }
          onShowConversationList={() => setIsMobileConversationListOpen(true)}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted/30">
          <Outlet
            context={{
              supabase,
              workspace,
              workspaceNumbers,
              registerChatActions,
            }}
          />
        </div>
        <ChatInput
          isValid={isValid}
          phoneNumber={phoneNumber}
          workspace={workspace as NonNullable<Workspace>}
          workspaceNumbers={chatInputWorkspaceNumbers}
          initialFrom={chatInputWorkspaceNumbers[0]?.phone_number || ""}
          handleSubmit={handleSubmit}
          handleImageSelect={handleImageSelect}
          handleImageRemove={handleImageRemove}
          selectedImages={selectedImages}
          selectedContact={selectedContact}
          messageFetcher={messageFetcher}
        />
      </Card>
      <Sheet
        open={isMobileConversationListOpen}
        onOpenChange={setIsMobileConversationListOpen}
      >
        <SheetContent side="left" className="w-[88vw] p-0 md:hidden">
          <MobileSheetHeader className="border-b px-4 py-3">
            <SheetTitle>Chats</SheetTitle>
          </MobileSheetHeader>
          <div className="h-[calc(100%-57px)]">
            <ConversationSidebar
              campaigns={campaigns}
              chats={displayedChats}
              chatsError={chatsError}
              contactNumber={contact_number}
              formatDate={formatDate}
              handleExistingConversationClick={handleExistingConversationClick}
              hideStopConversations={hideStopConversations}
              onHideStopChange={handleHideStopChange}
              onLoadMore={handleLoadMore}
              onNewChatClick={handleNewChatClick}
              optOutKeywords={optOutKeywords}
              paginationError={paginationFetcher.data?.chatsError ?? null}
              paginationFetcherState={paginationFetcher.state}
              paginationState={paginationState}
              searchParams={searchParams}
              sortBy={sortBy}
              updateFilters={updateFilters}
            />
          </div>
        </SheetContent>
      </Sheet>
      <ChatAddContactDialog
        existingContact={dialogContact}
        isDialogOpen={Boolean(dialogContact?.phone)}
        setDialog={(open: boolean | null) =>
          setDialog(open ? dialogContact : null)
        }
        contact_number={contact_number}
        workspace_id={workspace.id}
      />
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  logger.error("Chats route error boundary caught error:", error);
  return <div className="p-4 text-sm text-red-500">Error loading chats.</div>;
}
