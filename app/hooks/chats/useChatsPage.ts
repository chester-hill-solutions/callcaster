import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useOutlet,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router";
import {
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { isOptOutMessage } from "@/lib/chat-opt-out";
import { formatMessageTimestamp, normalizePhoneNumber } from "@/lib/utils";
import { phoneNumbersMatch } from "@/hooks/realtime/useChatRealtime";
import { useContactSearch } from "@/hooks/contact/useContactSearch";
import { useSupabaseRealtimeSubscription } from "@/hooks/realtime/useSupabaseRealtime";
import {
  getConversationParticipantPhones,
  getChatSortOption,
  sortConversationSummaries,
} from "@/lib/chat-conversation-sort";
import { useImageHandling } from "@/hooks/chats/useImageHandling";
import { markConversationRead } from "@/lib/chats/messaging-client";
import type { Contact, Workspace } from "@/lib/types";
import type { Tables } from "@/lib/database.types";
import { logger } from "@/lib/logger.client";
import {
  ALL_CAMPAIGNS_VALUE,
  getWorkspacePhoneKeys,
  mergeConversationPages,
  phoneRegex,
  upsertConversationFromMessage,
} from "@/lib/chats/conversation-utils";
import type {
  Chat,
  ChatInputWorkspaceNumber,
  ChatsLoaderData,
  ChatsWorkspaceContextType,
} from "@/lib/chats/types";

export function useChatsPage() {
  const { supabase, workspace } = useOutletContext<ChatsWorkspaceContextType>();
  const {
    chats,
    chatsError,
    pagination,
    potentialContacts,
    contact,
    campaigns,
    workspaceNumbers,
    optOutKeywords,
  } = useLoaderData<ChatsLoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const hideStopConversations = searchParams.get("hide_stop") === "1";
  const messageFetcher = useFetcher({ key: "messages" });
  const paginationFilterKey = useMemo(() => {
    const campaignFilter = searchParams.get("campaign_id") ?? ALL_CAMPAIGNS_VALUE;
    const sortFilter = getChatSortOption(searchParams.get("sort"));
    return `${campaignFilter}:${sortFilter}`;
  }, [searchParams]);
  const paginationFetcher = useFetcher<ChatsLoaderData>({
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
  const contact_number = params["contact_number"] ?? "";
  const formatDate = formatMessageTimestamp;
  const sortBy = getChatSortOption(searchParams.get("sort"));
  const [loadedChats, setLoadedChats] = useState(chats);
  const [paginationState, setPaginationState] = useState(pagination);
  const workspacePhoneKeys = useMemo(
    () => getWorkspacePhoneKeys(workspaceNumbers),
    [workspaceNumbers],
  );
  const chatInputWorkspaceNumbers = useMemo<ChatInputWorkspaceNumber[]>(
    () =>
      workspaceNumbers
        .filter((workspaceNumber) => Boolean(workspaceNumber.phone_number))
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
    if (paginationFetcher.state !== "idle") {
      return;
    }
    const fetchedPage = paginationFetcher.data?.pagination.page;
    if (fetchedPage != null && fetchedPage > pagination.page) {
      return;
    }
    setLoadedChats(chats);
    setPaginationState(pagination);
    requestedPageRef.current = pagination.page;
  }, [chats, pagination, paginationFetcher.data, paginationFetcher.state]);

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

  const {
    selectedImages,
    setSelectedImages,
    handleImageSelect,
    handleImageRemove,
  } = useImageHandling(workspace.id);

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
    workspace_id: workspace.id,
    contact_number,
    potentialContacts,
    dropdownRef,
    initialContact: contact,
  });

  useEffect(() => {
    if (!outlet || paginationFetcher.state !== "idle") return;
    const decoded = contact_number ? decodeURIComponent(contact_number) : "";
    if (decoded && !phoneRegex.test(decoded)) {
      navigate(".");
    }
  }, [contact_number, navigate, outlet, paginationFetcher.state]);

  const clearUnreadCount = useCallback((number: string) => {
    setLoadedChats((currentChats) =>
      currentChats.map((chat) =>
        phoneNumbersMatch(chat.contact_phone, number)
          ? { ...chat, unread_count: 0 }
          : chat,
      ),
    );
  }, []);

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

      clearUnreadCount(contactPhone);
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

  const markConversationReadForContact = useCallback(
    (number: string) => {
      clearUnreadCount(number);

      void markConversationRead(workspace.id, number).then(
        () => {
          window.dispatchEvent(
            new CustomEvent("messages-read", {
              detail: { contactNumber: number },
            }),
          );
        },
        (err: unknown) => logger.error("Error marking messages as read:", err),
      );
    },
    [clearUnreadCount, workspace.id],
  );

  const handleContactSelect = useCallback(
    (selected: Contact) => {
      const number = normalizePhoneNumber(selected.phone || "");
      if (number) {
        closeMobileConversationList();
        navigate(`./${number}`);
        markConversationReadForContact(number);
      }
    },
    [closeMobileConversationList, navigate, markConversationReadForContact],
  );

  const handleExistingConversationClick = useCallback(
    (nextPhoneNumber: string) => {
      closeMobileConversationList();
      const search = new URLSearchParams(searchParams);
      if (hideStopConversations) search.set("hide_stop", "1");
      else search.delete("hide_stop");
      const query = search.toString();
      const path = `./${encodeURIComponent(nextPhoneNumber)}`;
      navigate(query ? `${path}?${query}` : path);
      markConversationReadForContact(nextPhoneNumber);
    },
    [
      closeMobileConversationList,
      navigate,
      searchParams,
      hideStopConversations,
      markConversationReadForContact,
    ],
  );

  useEffect(() => {
    const handleMessageRead = (event: Event) => {
      const customEvent = event as CustomEvent<{ contactNumber?: string }>;
      const readContactNumber = customEvent.detail?.contactNumber;

      if (!readContactNumber) {
        return;
      }

      clearUnreadCount(readContactNumber);
    };

    window.addEventListener("message-read", handleMessageRead);
    window.addEventListener("messages-read", handleMessageRead);

    return () => {
      window.removeEventListener("message-read", handleMessageRead);
      window.removeEventListener("messages-read", handleMessageRead);
    };
  }, [clearUnreadCount]);

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

  const handleHideStopChange = useCallback(
    (checked: boolean) => {
      setSearchParams((previousParams) => {
        const nextParams = new URLSearchParams(previousParams);
        if (checked) {
          nextParams.set("hide_stop", "1");
        } else {
          nextParams.delete("hide_stop");
        }
        return nextParams;
      });
    },
    [setSearchParams],
  );

  const handleNewChatClick = useCallback(() => {
    closeMobileConversationList();
  }, [closeMobileConversationList]);

  const sidebarProps = {
    campaigns,
    chats: displayedChats,
    chatsError,
    contactNumber: contact_number,
    formatDate,
    handleExistingConversationClick,
    hideStopConversations,
    onHideStopChange: handleHideStopChange,
    onLoadMore: handleLoadMore,
    onNewChatClick: handleNewChatClick,
    paginationError: paginationFetcher.data?.chatsError ?? null,
    paginationFetcherState: paginationFetcher.state,
    paginationState,
    searchParams,
    sortBy,
    updateFilters,
  } as const;

  return {
    supabase,
    workspace,
    workspaceNumbers,
    registerChatActions,
    outlet,
    contact,
    potentialContacts,
    phoneNumber,
    contact_number,
    handlePhoneChange,
    isValid,
    selectedContact,
    contacts,
    toggleContactMenu,
    isContactMenuOpen,
    handleContactSelect,
    dropdownRef,
    searchError,
    existingConversation: existingConversation as unknown as Chat,
    handleExistingConversationClick,
    setDialog,
    dialogContact,
    isMobileConversationListOpen,
    setIsMobileConversationListOpen,
    sidebarProps,
    chatInputWorkspaceNumbers,
    handleSubmit,
    handleImageSelect,
    handleImageRemove,
    selectedImages,
    messageFetcher,
    contactOptOut: Boolean(contact?.opt_out),
  };
}
