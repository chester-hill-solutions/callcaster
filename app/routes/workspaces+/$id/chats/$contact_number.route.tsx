export { loader } from "./$contact_number.loader.server";

import { data as routeData, LoaderFunctionArgs, useFetcher, useLoaderData, useLocation, useOutletContext, useParams } from "react-router";

import { useCallback, useEffect, useRef, useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useChatRealTime } from "@/hooks/realtime/useChatRealtime";
import ChatMessages from "@/components/sms-ui/ChatMessages";
import { Message, Workspace, WorkspaceNumber } from "@/lib/types";
import { normalizePhoneNumber } from "@/lib/utils";
import { logger } from "@/lib/logger.client";

import { parseOptOutKeywords } from "@/lib/chat-opt-out";
import { useInfiniteScroll } from "@/hooks";

export default function ChatScreen() {
  const { supabase, workspace, workspaceNumbers, registerChatActions } = useOutletContext<{
    supabase: SupabaseClient;
    workspace: NonNullable<Workspace>;
    workspaceNumbers: WorkspaceNumber[];
    registerChatActions?: (actions: { addOptimisticMessage?: (p: { body: string; from: string; to: string; media?: string }) => void } | null) => void;
  }>();
  const {
    messages: initialMessages,
    hasMore: initialHasMore,
    contact_number: loaderContactNumber,
  } = useLoaderData<{
    messages: Message[];
    hasMore: boolean;
    contact_number: string;
    optOutKeywords: string[];
  }>();
  const { contact_number: paramContactNumber } = useParams();
  const location = useLocation();

  const contact_number = loaderContactNumber || paramContactNumber;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef<number>(initialMessages.length);
  const scrollPositionRef = useRef<number>(0);
  const hasMarkedAsReadRef = useRef<boolean>(false);
  const savedScrollRef = useRef<{ height: number; top: number } | null>(null);
  const didPrependRef = useRef(false);
  const lastMergedFetcherDataRef = useRef<unknown>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(initialHasMore);

  const olderFetcher = useFetcher<{
    messages: Message[];
    hasMore: boolean;
    contact_number: string;
    optOutKeywords: string[];
  }>();

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
  }, [location.pathname, loadingOlder, hasMoreOlder, messages]);

  const [loadMoreSentinelRef] = useInfiniteScroll({
    onLoadMore: loadOlder,
    hasMore: hasMoreOlder,
    loading: loadingOlder,
    rootMargin: "120px",
  });

  // Merge older page when fetcher returns (once per response)
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

  // Restore scroll position after prepending older messages
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

  // Mark all messages as read when the component mounts or when contact_number changes
  useEffect(() => {
    if (!contact_number || hasMarkedAsReadRef.current) return;
    
    const markMessagesAsRead = async () => {
      try {
        // Update all received messages for this contact to delivered
        const { error } = await supabase
          .from("message")
          .update({ status: "delivered" })
          .eq("workspace", workspace.id)
          .eq("status", "received")
          .or(`from.eq.${contact_number},to.eq.${contact_number}`);
        
        if (error) {
          logger.error("Error marking messages as read:", error);
        } else {
          // Update local message state to reflect the change
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg?.status === "received" ? { ...msg, status: "delivered" } : msg
            )
          );
          
          // Trigger a global event to notify other components that messages have been read
          window.dispatchEvent(new CustomEvent('messages-read', { 
            detail: { contactNumber: contact_number }
          }));
          
          hasMarkedAsReadRef.current = true;
        }
      } catch (err) {
        logger.error("Error in markMessagesAsRead:", err);
      }
    };
    
    markMessagesAsRead();
    
    // Reset the flag when unmounting so it works again if we return to this contact
    return () => {
      hasMarkedAsReadRef.current = false;
    };
  }, [contact_number, supabase, workspace.id, setMessages]);

  const updateMessageStatus = async (messageId: string) => {
    const { error } = await supabase
      .from("message")
      .update({ status: "delivered" })
      .eq("sid", messageId);

    if (error) {
      logger.error("Error updating message status:", error);
    } else {
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg?.sid === messageId ? { ...msg, status: "delivered" } : msg,
        ),
      );
      
      // Trigger a global event to notify other components that a message has been read
      window.dispatchEvent(new CustomEvent('message-read', { 
        detail: { messageId, contactNumber: contact_number }
      }));
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

    return () => {
      observer.disconnect();
    };
  }, []); // Only set up once

  // Handle new message elements
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
    // Only observe new messages
    const messageElements = document.querySelectorAll<HTMLElement>(".message-item");
    const newMessages = Array.from(messageElements).slice(lastMessageCountRef.current);
    
    newMessages.forEach((el) => observer.observe(el));
    lastMessageCountRef.current = messageElements.length;

    return () => {
      observer.disconnect();
    };
  }, [messages]);

  // Intelligent scroll handling
  useEffect(() => {
    if (!messagesEndRef.current) return;

    const container = messagesEndRef.current.parentElement;
    if (!container) return;

    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
    const hasNewMessages = messages.length > lastMessageCountRef.current;

    if (hasNewMessages) {
      if (isAtBottom) {
        // User is at bottom, scroll to new messages
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      } else {
        // Preserve scroll position if user has scrolled up
        scrollPositionRef.current = container.scrollTop;
        requestAnimationFrame(() => {
          container.scrollTop = scrollPositionRef.current;
        });
      }
    }
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      <ChatMessages
        messages={
          messages as React.ComponentProps<typeof ChatMessages>["messages"]
        }
        messagesEndRef={messagesEndRef}
        scrollContainerRef={scrollContainerRef}
        loadMoreSentinelRef={loadMoreSentinelRef}
        hasMoreOlder={hasMoreOlder}
        loadingOlder={loadingOlder}
      />
    </div>
  );
}
