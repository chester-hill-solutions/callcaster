import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import { parseChatSenderSelection } from "@/lib/sms-campaign-send-mode";
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
    senderSelection,
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
      from?: string;
      to: string;
      media?: string;
      sid?: string;
    }) => void;
    markOptimisticMessageFailed?: (sid: string) => void;
  } | null>(null);
  const pendingOptimisticMessageRef = useRef<{
    sid: string;
    body: string;
    composerKey: string;
    to: string;
    observedSubmission: boolean;
    draftRevision: number;
  } | null>(null);
  const requestedPageRef = useRef(pagination.page);
  /**
   * The filter this accumulation belongs to. A page number cannot identify a
   * response — after "load more" the fetcher holds a later page than the loader,
   * permanently, and comparing the two discards every revalidation. The filter
   * can: a different filter means a different list, and the same filter means
   * the response should be folded in.
   */
  const accumulatedFilterKeyRef = useRef<string | null>(null);
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
  const composerKey = `${workspace.id}:${contact_number || "new"}`;
  const [draft, setDraft] = useState({ key: composerKey, body: "", revision: 0 });
  // Reset before rendering a different conversation, as the keyed composer did.
  if (draft.key !== composerKey) {
    setDraft({ key: composerKey, body: "", revision: draft.revision + 1 });
  }
  const bodyValue = draft.key === composerKey ? draft.body : "";
  const onBodyChange = useCallback(
    (body: string) => setDraft((current) => ({
      key: composerKey, body, revision: current.revision + 1,
    })),
    [composerKey],
  );
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
    const fallback = chatInputWorkspaceNumbers[0]?.phone_number || "";
    if (!establishedFromNumber) return fallback;

    const establishedKey = getConversationPhoneKey(establishedFromNumber);
    const matchedWorkspaceNumber = chatInputWorkspaceNumbers.find(
      (num) => getConversationPhoneKey(num.phone_number) === establishedKey,
    );
    // Only use a sender that appears in the From options. An historical
    // conversation number that is no longer rented would leave the controlled
    // <select> with a blank selection.
    return matchedWorkspaceNumber?.phone_number || fallback;
  }, [establishedFromNumber, chatInputWorkspaceNumbers]);

  const chatsRoutePath = `/workspaces/${workspace.id}/chats`;
  const closeMobileConversationList = useCallback(() => {
    setIsMobileConversationListOpen(false);
  }, []);

  /**
   * @effect CANDIDATE-REMOVE: fold a fresh loader response into the accumulated chat list — merging it onto the pages already loaded, so a revalidation updates counts and ordering without discarding them.
   * @effect-deps chats, pagination (loader data to fold in), paginationFetcher.data, paginationFetcher.state (skip while a "load more" is in flight), paginationFilterKey (the discriminator for a reset)
   * @effect-side-effects none (setState + ref write only)
   * @effect-why-not-loader chats/pagination are already loader data (via useLoaderData); this copies them into local state, the "sync state to a prop" pattern the effects guide flags. It's kept as an effect because loadedChats also accumulates fetcher-loaded pages over time (see the effect below) and must be reconciled against a fresh loader response without discarding those extra pages — a case not implemented today via a pure derivation.
   */
  useEffect(() => {
    if (paginationFetcher.state !== "idle") {
      return;
    }

    // A different filter means a different list, so the accumulated pages
    // belong to a result the agent is no longer looking at. The fetcher key
    // already carries the filter, so this is the one reset signal that stays
    // correct when page numbers are in play.
    if (accumulatedFilterKeyRef.current !== paginationFilterKey) {
      accumulatedFilterKeyRef.current = paginationFilterKey;
      setLoadedChats(chats);
      setPaginationState(pagination);
      requestedPageRef.current = pagination.page;
      return;
    }

    // Same filter, already paginating. This used to compare page numbers and
    // drop the response whenever the fetcher held a later page, which after the
    // first "load more" discarded every page-1 revalidation for the life of the
    // page: a realtime event on a page-1 conversation never updated its unread
    // count again. Page numbers are not an identity — merge instead.
    setLoadedChats((currentChats) => mergeConversationPages(currentChats, chats));
    // The cursor only moves forward. Rewinding it to the loader's page 1 would
    // make the next "load more" re-request a page already held.
    setPaginationState((current) =>
      pagination.page > current.page ? pagination : current,
    );
    requestedPageRef.current = Math.max(requestedPageRef.current, pagination.page);
  }, [
    chats,
    pagination,
    paginationFetcher.data,
    paginationFetcher.state,
    paginationFilterKey,
  ]);

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
      if (
        !toNumber ||
        messageFetcher.state !== "idle" ||
        pendingOptimisticMessageRef.current
      ) {
        return;
      }

      const formData = new FormData(target);
      // ChatInput only renders a hidden `contact_number` field for the
      // "new number" composer flow (header search); replying inside an
      // already-open thread has no such field in the DOM, so `toNumber`
      // (route param or header state) must be set explicitly or the action
      // receives no destination number at all and 500s before it can even
      // attempt the send.
      formData.set("contact_number", toNumber);
      formData.append("media", JSON.stringify(selectedImages));
      const body = (formData.get("body") as string) || "";
      // Resolve the sender the same way the action does, so the optimistic
      // bubble shows the number the message will actually be sent from. A
      // Messaging Service send has no specific number, hence `undefined`.
      const selection = parseChatSenderSelection({
        rawFrom: formData.get("from") as string | null,
        messagingServiceAvailable: senderSelection.messagingServiceReady,
      });
      const from =
        selection.mode === "messaging_service"
          ? undefined
          : selection.fromNumber || workspaceNumbers?.[0]?.phone_number || "";
      const media = formData.get("media") as string | undefined;
      const pendingSid = `pending-${Date.now()}`;
      pendingOptimisticMessageRef.current = {
        sid: pendingSid,
        body,
        composerKey,
        to: toNumber,
        observedSubmission: false,
        draftRevision: draft.revision,
      };
      chatActionsRef.current?.addOptimisticMessage?.({
        body,
        from,
        to: toNumber,
        media,
        sid: pendingSid,
      });

      messageFetcher.submit(formData, { method: "POST" });

      setDraft((current) => ({ ...current, body: "" }));
      setSelectedImages([]);
    },
    [
      composerKey,
      draft.revision,
      contact_number,
      phoneNumber,
      messageFetcher,
      selectedImages,
      setSelectedImages,
      senderSelection.messagingServiceReady,
      workspaceNumbers,
    ],
  );

  /**
   * @effect When the message-send fetcher settles with an error, reconcile the optimistic UI: mark the pending optimistic message as failed and restore its text into the composer.
   * @effect-deps messageFetcher.state, messageFetcher.data, composerKey, contact_number, phoneNumber (send lifecycle and current recipient)
   * @effect-side-effects toast, optimistic message status, draft state; no DOM access or fetch
   * @effect-why-not-loader This reconciles optimistic client state against a fetcher action's result; it's inherently a "react after the fetcher settles" side effect, not something a loader or derived value can express.
   */
  useEffect(() => {
    const pending = pendingOptimisticMessageRef.current;
    if (!pending) return;
    if (messageFetcher.state !== "idle") {
      pending.observedSubmission = true;
      return;
    }
    // Clearing the draft renders before the fetcher starts; its old data is not a result.
    if (!pending.observedSubmission) return;

    const data = messageFetcher.data as
      | { error?: string; billing?: { nextSendBlocked?: boolean } }
      | undefined;
    if (!data || !data.error) {
      if (data?.billing?.nextSendBlocked) {
        toast.warning(
          "Message sent. Your credit balance is used up — add credits before sending more.",
        );
      }
      pendingOptimisticMessageRef.current = null;
      return;
    }

    toast.error(data.error);
    if (
      pending.composerKey === composerKey &&
      pending.to === (contact_number || phoneNumber)
    ) {
      chatActionsRef.current?.markOptimisticMessageFailed?.(pending.sid);
      setDraft((current) =>
        current.key === pending.composerKey &&
        current.revision === pending.draftRevision &&
        !current.body
          ? { ...current, body: pending.body }
          : current,
      );
    }
    pendingOptimisticMessageRef.current = null;
  }, [
    messageFetcher.state,
    messageFetcher.data,
    composerKey,
    contact_number,
    phoneNumber,
  ]);

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
    senderSelection,
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
    bodyValue,
    onBodyChange,
    handleSubmit,
    handleImageSelect,
    handleImageRemove,
    selectedImages,
    messageFetcher,
    contactOptOut: Boolean(contact?.opt_out),
  };
}
