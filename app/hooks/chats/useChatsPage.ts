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
import { isOptOutMessage } from "@/lib/chat-opt-out";
import { formatMessageTimestamp, normalizePhoneNumber } from "@/lib/utils";
import { phoneNumbersMatch } from "@/hooks/realtime/useChatRealtime";
import { useContactSearch } from "@/hooks/contact/useContactSearch";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceRealtime";
import {
  getConversationParticipantPhones,
  getConversationPhoneKey,
  getChatSortOption,
  sortConversationSummaries,
} from "@/lib/chat-conversation-sort";
import { useImageHandling } from "@/hooks/chats/useImageHandling";
import { markConversationRead } from "@/lib/chats/messaging-client";
import type { Contact, Workspace } from "@/lib/types";
import type { Tables } from "@/lib/db-types";
import type { RealtimeChangePayload } from "@/lib/workspace-events.shared";
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
  const { workspace } = useOutletContext<ChatsWorkspaceContextType>();
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
    const searchFilter = searchParams.get("search") ?? "";
    return `${campaignFilter}:${sortFilter}:${searchFilter}`;
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
      sid?: string;
    }) => void;
    markOptimisticMessageFailed?: (sid: string) => void;
  } | null>(null);
  const pendingOptimisticMessageRef = useRef<{ sid: string; body: string } | null>(
    null,
  );
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
          friendly_name: workspaceNumber.friendly_name ?? null,
        })),
    [workspaceNumbers],
  );
  // ConversationSummary.user_phone holds the workspace number that most
  // recently texted this contact. Resolving it here lets the composer
  // default to the number the contact already knows, instead of always
  // defaulting to the workspace's first number.
  const establishedFromNumber = useMemo(() => {
    if (!contact_number) return "";
    const activeConversation = loadedChats.find((chat) =>
      phoneNumbersMatch(chat.contact_phone, contact_number),
    );
    return activeConversation?.user_phone || "";
  }, [loadedChats, contact_number]);

  const initialFrom = useMemo(() => {
    if (establishedFromNumber) {
      const establishedKey = getConversationPhoneKey(establishedFromNumber);
      const matchedWorkspaceNumber = chatInputWorkspaceNumbers.find(
        (num) => getConversationPhoneKey(num.phone_number) === establishedKey,
      );
      return matchedWorkspaceNumber?.phone_number || establishedFromNumber;
    }
    return chatInputWorkspaceNumbers[0]?.phone_number || "";
  }, [establishedFromNumber, chatInputWorkspaceNumbers]);

  const chatsRoutePath = `/workspaces/${workspace.id}/chats`;
  const closeMobileConversationList = useCallback(() => {
    setIsMobileConversationListOpen(false);
  }, []);

  /**
   * @effect CANDIDATE-REMOVE: mirror the loader's chats/pagination into local loadedChats/paginationState whenever the loader revalidates (e.g. filter/search/sort change, realtime-triggered revalidation), skipping the sync if the pagination fetcher already loaded a further-ahead page.
   * @effect-deps chats, pagination (loader data to mirror), paginationFetcher.data, paginationFetcher.state (guards against clobbering an in-flight/completed "load more" page with stale loader data)
   * @effect-side-effects none (setState + ref write only)
   * @effect-why-not-loader chats/pagination are already loader data (via useLoaderData); this copies them into local state, the "sync state to a prop" pattern the effects guide flags. It's kept as an effect because loadedChats also accumulates fetcher-loaded pages over time (see the effect below) and must be reconciled against a fresh loader response without discarding those extra pages — a case not implemented today via a pure derivation.
   */
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

  /**
   * @effect Merge a newly-loaded "load more" page of conversations (from the pagination fetcher) into the accumulated local chat list, and advance the pagination cursor.
   * @effect-deps paginationFetcher.data (react to the fetcher settling with a new page)
   * @effect-side-effects none directly — reacts to a fetcher (external async subscription); performs setState + ref write
   * @effect-why-not-loader paginationFetcher is already the idiomatic fetcher for infinite-scroll pagination; accumulating results across multiple `.load()` calls over time is state, not a pure render-time derivation of the latest loader/fetcher value.
   */
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

  /**
   * @effect CANDIDATE-REMOVE: redirect back to the chats list when the route's contact_number param doesn't look like a valid phone number.
   * @effect-deps contact_number (the value to validate), navigate, outlet (only redirect once a child route is actually mounted), paginationFetcher.state (avoid redirecting mid-pagination-load)
   * @effect-side-effects none directly — calls router navigate() after render (not dom/timer/subscription/fetch)
   * @effect-why-not-loader Route-param validation like this is normally done in the loader (`throw redirect(...)`) before the invalid UI ever renders, rather than rendering first and then navigating away client-side in an effect. Left as-is because the current chats route loader isn't parameterized by contact_number in a way that makes this trivial to relocate without a wider route restructuring.
   */
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

  useWorkspaceEventSubscription({
    workspaceId: workspace.id,
    table: "message",
    filter: `workspace=eq.${workspace.id}`,
    onChange: (payload) => {
      const typedPayload = payload as RealtimeChangePayload<
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
      const pendingSid = `pending-${Date.now()}`;
      pendingOptimisticMessageRef.current = { sid: pendingSid, body };
      chatActionsRef.current?.addOptimisticMessage?.({
        body,
        from,
        to: toNumber,
        media,
        sid: pendingSid,
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

  /**
   * @effect When the message-send fetcher settles with an error, reconcile the optimistic UI: mark the pending optimistic message as failed and restore its text into the composer.
   * @effect-deps messageFetcher.state, messageFetcher.data (react to the send fetcher settling)
   * @effect-side-effects dom (reads/writes the #body input's value); no fetch itself (reacts to the existing send fetcher)
   * @effect-why-not-loader This reconciles optimistic client state against a fetcher action's result; it's inherently a "react after the fetcher settles" side effect, not something a loader or derived value can express.
   */
  useEffect(() => {
    if (messageFetcher.state !== "idle") return;
    const pending = pendingOptimisticMessageRef.current;
    if (!pending) return;

    const data = messageFetcher.data as { error?: string } | undefined;
    if (!data || !data.error) {
      pendingOptimisticMessageRef.current = null;
      return;
    }

    chatActionsRef.current?.markOptimisticMessageFailed?.(pending.sid);
    const bodyField = document.getElementById("body") as
      | HTMLTextAreaElement
      | HTMLInputElement
      | null;
    if (bodyField && !bodyField.value) {
      bodyField.value = pending.body;
    }
    pendingOptimisticMessageRef.current = null;
  }, [messageFetcher.state, messageFetcher.data]);

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

  /**
   * @effect Subscribe to the cross-hook "message-read"/"messages-read" window events (dispatched by useChatThread when it marks messages read) so the sidebar's unread badges clear immediately.
   * @effect-deps clearUnreadCount (stable useCallback; re-subscribes only if it changes identity)
   * @effect-side-effects subscription (window.addEventListener for two custom event names; removed on cleanup)
   * @effect-why-not-loader This listens for an imperative cross-hook notification (useChatThread and useChatsPage are siblings under a route Outlet with no direct prop path), not data fetching or derivable state.
   */
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
    initialFrom,
    establishedFromNumber,
    handleSubmit,
    handleImageSelect,
    handleImageRemove,
    selectedImages,
    messageFetcher,
    contactOptOut: Boolean(contact?.opt_out),
  };
}
