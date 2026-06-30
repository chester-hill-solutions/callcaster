import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData, useLocation, useParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useChatRealTime } from "@/hooks/realtime/useChatRealtime";
import { useInfiniteScroll } from "@/hooks";
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
  supabase: SupabaseClient;
  workspace: NonNullable<Workspace>;
  workspaceNumbers: WorkspaceNumber[];
  registerChatActions?: (
    actions: {
      addOptimisticMessage?: (p: {
        body: string;
        from: string;
        to: string;
        media?: string;
      }) => void;
    } | null,
  ) => void;
  contactOptOut?: boolean;
};

export function useChatThread({
  supabase,
  workspace,
  registerChatActions,
  contactOptOut = false,
}: Pick<ChatThreadOutletContext, "supabase" | "workspace" | "registerChatActions"> & {
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

  const { messages, setMessages, addOptimisticMessage } = useChatRealTime({
    supabase,
    initial: initialMessages,
    workspace: workspace.id,
    contact_number,
  });

  useEffect(() => {
    setHasMoreOlder(initialHasMore);
  }, [initialHasMore]);

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

  useEffect(() => {
    lastMessageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    registerChatActions?.({ addOptimisticMessage });
    return () => registerChatActions?.(null);
  }, [addOptimisticMessage, registerChatActions]);

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
  }, [messages]);

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
