import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData, useLocation, useParams } from "react-router";
import { useChatRealTime } from "@/hooks/realtime/useChatRealtime";
import { useInfiniteScroll } from "@/hooks/useIntersectionObserver";
import { markConversationRead } from "@/lib/chats/messaging-client";
import { isOptOutMessage } from "@/lib/chat-opt-out";
import { logger } from "@/lib/logger.client";
import type { Message, Workspace, WorkspaceNumber } from "@/lib/types";

type ChatThreadLoaderData = {
  messages: Message[];
  hasMore: boolean;
  contact_number: string;
  optOutKeywords: string[];
};

type ChatThreadOutletContext = {
  workspace: NonNullable<Workspace>;
  workspaceNumbers: WorkspaceNumber[];
  registerChatActions?: (
    actions: {
      addOptimisticMessage?: (p: {
        body: string;
        from: string;
        to: string;
        media?: string;
        sid?: string;
      }) => void;
      markOptimisticMessageFailed?: (sid: string) => void;
    } | null,
  ) => void;
  contactOptOut?: boolean;
};

export function useChatThread({
    workspace,
  registerChatActions,
  contactOptOut = false,
}: Pick<ChatThreadOutletContext, "workspace" | "registerChatActions"> & {
  contactOptOut?: boolean;
}) {
  const {
    messages: initialMessages,
    hasMore: initialHasMore,
    contact_number: loaderContactNumber,
    optOutKeywords,
  } = useLoaderData<ChatThreadLoaderData>();
  const { contact_number: paramContactNumber } = useParams();
  const location = useLocation();

  const contact_number = loaderContactNumber || paramContactNumber || "";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef<number>(initialMessages.length);
  const scrollPositionRef = useRef<number>(0);
  const hasMarkedAsReadRef = useRef<boolean>(false);
  const savedScrollRef = useRef<{ height: number; top: number } | null>(null);
  const didPrependRef = useRef(false);
  const lastMergedFetcherDataRef = useRef<unknown>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(initialHasMore);

  const olderFetcher = useFetcher<ChatThreadLoaderData>();

  const { messages, setMessages, addOptimisticMessage, markOptimisticMessageFailed } =
    useChatRealTime({
      initial: initialMessages,
      workspace: workspace.id,
      contact_number,
    });

  /**
   * @effect CANDIDATE-REMOVE: mirror the loader's initialHasMore into local hasMoreOlder state every time the thread's loader data changes (e.g. switching contact_number).
   * @effect-deps initialHasMore (loader value for the freshly-loaded thread)
   * @effect-side-effects none (setState only)
   * @effect-why-not-loader This copies loader data into state after a render — the "reset state when a prop changes" pattern the effects guide recommends avoiding (e.g. via a `key` remount or reading useLoaderData directly). It's an effect today because hasMoreOlder is also mutated later by the older-messages fetcher merge, and this route doesn't remount per contact_number.
   */
  useEffect(() => {
    setHasMoreOlder(initialHasMore);
  }, [initialHasMore]);

  /**
   * @effect Clear the "already merged" fetcher-data marker when the active conversation changes, so a stale older-messages page from the previous thread isn't mistaken for already-merged data.
   * @effect-deps contact_number (a new thread means any previously loaded olderFetcher.data no longer applies)
   * @effect-side-effects none (ref mutation only)
   * @effect-why-not-loader This resets bookkeeping in a ref, not render state; it exists purely to keep the fetcher-merge effect below correct across thread switches.
   */
  useEffect(() => {
    lastMergedFetcherDataRef.current = null;
  }, [contact_number]);

  const loadingOlder =
    olderFetcher.state === "loading" || olderFetcher.state === "submitting";

  const loadOlder = useCallback(() => {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return;
    const oldest = messages[0];
    const before = oldest?.date_created;
    if (!before) return;
    const beforeStr =
      typeof before === "string" ? before : new Date(before).toISOString();
    if (scrollContainerRef.current) {
      savedScrollRef.current = {
        height: scrollContainerRef.current.scrollHeight,
        top: scrollContainerRef.current.scrollTop,
      };
    }
    olderFetcher.load(
      `${location.pathname}?before=${encodeURIComponent(beforeStr)}`,
    );
  }, [location.pathname, loadingOlder, hasMoreOlder, messages, olderFetcher]);

  const [loadMoreSentinelRef] = useInfiniteScroll({
    onLoadMore: loadOlder,
    hasMore: hasMoreOlder,
    loading: loadingOlder,
    rootMargin: "120px",
  });

  /**
   * @effect Merge a newly-loaded page of older messages (from the "load older" fetcher) into the message list once it resolves, and mark that a prepend happened so scroll position can be restored.
   * @effect-deps olderFetcher.data (react to the fetcher settling with a new page), setMessages (stable setter from useChatRealTime)
   * @effect-side-effects none directly — reacts to a fetcher (an external async subscription), not a fetch itself; performs setState + ref writes
   * @effect-why-not-loader olderFetcher is already the idiomatic React Router fetcher for this pagination; this effect is the standard way to react to fetcher.data changing over time and accumulate results across multiple loads, which can't be expressed as a pure render-time derivation.
   */
  useEffect(() => {
    const data = olderFetcher.data;
    if (!data?.messages?.length || data === lastMergedFetcherDataRef.current)
      return;
    lastMergedFetcherDataRef.current = data;
    const older = data.messages as Message[];
    setHasMoreOlder(data.hasMore === true);
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m?.sid).filter(Boolean));
      const prepend = older.filter((m) => m?.sid && !ids.has(m.sid));
      return [...prepend, ...prev];
    });
    didPrependRef.current = true;
  }, [olderFetcher.data, setMessages]);

  /**
   * @effect After older messages are prepended, restore the scroll position so the viewport stays anchored on the same messages instead of jumping to the top.
   * @effect-deps messages.length (fires once the prepended messages have actually rendered into the DOM)
   * @effect-side-effects dom (reads/writes scrollContainerRef.current.scrollTop)
   * @effect-why-not-loader Adjusting scrollTop must happen after the DOM reflects the new message count; this is inherently an imperative DOM effect, not derivable data.
   */
  useEffect(() => {
    if (
      didPrependRef.current &&
      savedScrollRef.current &&
      scrollContainerRef.current
    ) {
      const { height, top } = savedScrollRef.current;
      scrollContainerRef.current.scrollTop =
        top + (scrollContainerRef.current.scrollHeight - height);
      didPrependRef.current = false;
      savedScrollRef.current = null;
    }
  }, [messages.length]);

  /**
   * @effect Track the previous rendered message count in a ref so the scroll-to-bottom effect below can detect when new messages arrived.
   * @effect-deps messages.length (records the count after every render where it changes)
   * @effect-side-effects none (ref mutation only)
   * @effect-why-not-loader Pure "previous value" bookkeeping for another effect's comparison; not data that can be derived at render time since it must reflect what was last rendered.
   */
  useEffect(() => {
    lastMessageCountRef.current = messages.length;
  }, [messages.length]);

  /**
   * @effect Expose this thread's optimistic-message handlers to the parent chats-page hook (which owns the message-submit form) via a registration callback, and unregister them on unmount/change.
   * @effect-deps addOptimisticMessage, markOptimisticMessageFailed (re-register whenever the underlying handlers from useChatRealTime change identity), registerChatActions (the parent-supplied registration callback)
   * @effect-side-effects none (calls a callback prop; no DOM/timer/subscription/fetch)
   * @effect-why-not-loader This is cross-hook imperative wiring (the thread is rendered via an <Outlet/>, so there's no direct parent-child prop path for the chats-page submit handler to reach these callbacks); not data fetching or derivable state.
   */
  useEffect(() => {
    registerChatActions?.({ addOptimisticMessage, markOptimisticMessageFailed });
    return () => registerChatActions?.(null);
  }, [addOptimisticMessage, markOptimisticMessageFailed, registerChatActions]);

  /**
   * @effect Mark the conversation as read (server call) once when a thread is opened, updating local message statuses and notifying the sidebar via a window event.
   * @effect-deps contact_number (re-fires the mark-as-read call when the viewed thread changes), workspace.id, setMessages (stable setter)
   * @effect-side-effects fetch (markConversationRead) + dom event dispatch (window.dispatchEvent("messages-read")) + setState; guarded by hasMarkedAsReadRef so it only fires once per contact_number
   * @effect-why-not-loader This is a mutation triggered by the user viewing the thread, not data required to render it, so a loader can't express it. It runs automatically on mount/thread-change (no user click to hang a fetcher.submit off), and needs the ref guard for idempotency, which is easiest to express as an effect.
   */
  useEffect(() => {
    if (!contact_number || hasMarkedAsReadRef.current) return;

    const markMessagesAsRead = async () => {
      try {
        await markConversationRead(workspace.id, contact_number);

        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg?.status === "received" ? { ...msg, status: "delivered" } : msg,
          ),
        );

        window.dispatchEvent(
          new CustomEvent("messages-read", {
            detail: { contactNumber: contact_number },
          }),
        );

        hasMarkedAsReadRef.current = true;
      } catch (err) {
        logger.error("Error in markMessagesAsRead:", err);
      }
    };

    markMessagesAsRead();

    return () => {
      hasMarkedAsReadRef.current = false;
    };
  }, [contact_number, workspace.id, setMessages]);

  const updateMessageStatus = async (messageId: string) => {
    try {
      await markConversationRead(workspace.id, contact_number, {
        messageSid: messageId,
      });

      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg?.sid === messageId ? { ...msg, status: "delivered" } : msg,
        ),
      );

      window.dispatchEvent(
        new CustomEvent("message-read", {
          detail: { messageId, contactNumber: contact_number },
        }),
      );
    } catch (error) {
      logger.error("Error updating message status:", error);
    }
  };

  const observerCallback = (target: HTMLElement) => {
    const messageId = target.dataset.messageId;
    const messageStatus = target.dataset.messageStatus;
    if (messageStatus === "received") {
      updateMessageStatus(messageId as string);
    }
  };

  /**
   * @effect Attach an IntersectionObserver to every rendered `.message-item` so inbound "received" messages get marked "delivered" once they actually scroll into view.
   * @effect-deps messages (re-attaches the observer whenever the rendered message list changes, so newly-rendered DOM nodes get observed); `observerCallback` is intentionally omitted from the deps array — see eslint-disable comment below.
   * @effect-side-effects dom (creates/observes/disconnects an IntersectionObserver over `.message-item` elements); indirectly triggers a fetch via observerCallback -> updateMessageStatus -> markConversationRead when a message intersects
   * @effect-why-not-loader Observing on-screen visibility of DOM nodes is inherently an imperative browser API effect; it isn't loader-able or derivable data.
   */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            observerCallback(entry.target as HTMLElement);
          }
        });
      },
      { threshold: 0.5 },
    );
    const messageElements = document.querySelectorAll<HTMLElement>(".message-item");
    messageElements.forEach((el) => observer.observe(el));
    lastMessageCountRef.current = messageElements.length;

    return () => {
      observer.disconnect();
    };
    // observerCallback is re-created every render (it closes over updateMessageStatus,
    // which is also unmemoized) and is not being added to the deps array: doing so
    // would tear down and recreate the IntersectionObserver on every render instead
    // of only when the message list changes, causing observer churn and duplicate
    // read-marking races. Keeping [messages] as the sole dep preserves the intended
    // "re-observe only when the rendered messages change" behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  /**
   * @effect Auto-scroll the thread to the newest message when new messages arrive, but only if the user was already near the bottom; otherwise preserve their current scroll position.
   * @effect-deps messages (detects new arrivals by comparing messages.length to lastMessageCountRef)
   * @effect-side-effects dom (scrollIntoView, and manual scrollTop restoration via requestAnimationFrame)
   * @effect-why-not-loader Scroll positioning must run after the new messages are in the DOM; it's not expressible as loader/derived data.
   */
  useEffect(() => {
    if (!messagesEndRef.current) return;

    const container = messagesEndRef.current.parentElement;
    if (!container) return;

    const isAtBottom =
      container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
    const hasNewMessages = messages.length > lastMessageCountRef.current;

    if (hasNewMessages) {
      if (isAtBottom) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      } else {
        scrollPositionRef.current = container.scrollTop;
        requestAnimationFrame(() => {
          container.scrollTop = scrollPositionRef.current;
        });
      }
    }
  }, [messages]);

  const lastInboundBody = [...messages]
    .reverse()
    .find((message) => message?.direction === "inbound")?.body;

  const optedOut =
    contactOptOut ||
    isOptOutMessage(lastInboundBody ?? null, optOutKeywords);

  return {
    contact_number,
    messages,
    messagesEndRef,
    scrollContainerRef,
    loadMoreSentinelRef,
    hasMoreOlder,
    loadingOlder,
    optedOut,
  };
}
