import { useEffect, useState, useCallback, useRef } from "react";
import type { Message } from "@/lib/types";
import type { Database, Tables } from "@/lib/db-types";
import { compareByRecentActivity } from "@/lib/chat-conversation-sort";
import {
  fetchConversationSummaries,
  markConversationRead,
} from "@/lib/chats/messaging-client";
import { useWorkspaceEventSubscription } from "./useWorkspaceEventSubscription";
import { type RealtimeChangePayload } from "@/lib/workspace-events.shared";
import { logger } from "@/lib/logger.client";

type ConversationSummary = NonNullable<Database["public"]["Functions"]["get_conversation_summary"]["Returns"][number]>;

// Helper function to normalize phone numbers for comparison
function normalizePhoneForComparison(phone: string | null): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");
  
  // Handle North American numbers (ensure they start with 1)
  if (digits.length === 10) {
    return "1" + digits;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    return digits;
  }
  
  return digits;
}

// Helper function to check if two phone numbers match
export function phoneNumbersMatch(phone1: string | null, phone2: string | null): boolean {
  if (!phone1 || !phone2) return false;
  
  const normalized1 = normalizePhoneForComparison(phone1);
  const normalized2 = normalizePhoneForComparison(phone2);
  
  return normalized1 === normalized2;
}

/**
 * Hook for managing real-time chat messages
 * 
 * Subscribes to Postgres realtime changes for messages in a workspace, automatically
 * updating the messages list when new messages are inserted. Filters messages by
 * workspace and optionally by contact number. Prevents duplicate messages using
 * message SID tracking.
 * 
 * Features:
 * - Automatic realtime subscription to message table
 * - Contact filtering (if contact_number is provided)
 * - Duplicate message prevention
 * - Failed message filtering
 * 
 * @param params - Configuration object
 * @param params.client - Postgres client instance
 * @param params.initial - Initial list of messages
 * @param params.workspace - Workspace ID to filter messages
 * @param params.contact_number - Optional contact phone number to filter messages
 * 
 * @returns Object containing:
 *   - messages: Current list of messages
 *   - setMessages: Setter for messages (use with caution, prefer realtime updates)
 * 
 * @example
 * ```tsx
 * const { messages } = useChatRealTime({
 *    *   initial: initialMessages,
 *   workspace: workspaceId,
 *   contact_number: contactPhone,
 * });
 * ```
 */
export const useChatRealTime = ({
    initial,
  workspace,
  contact_number,
}: {
  initial: Message[];
  workspace: string;
  contact_number?: string;
}) => {
  const [messages, setMessages] = useState<Message[]>(initial);
  const initialRef = useRef(initial);
  const messageIdsRef = useRef(new Set(initial.map(msg => msg?.sid)));
  const contactNumberRef = useRef(contact_number);

  /**
   * @effect Reset local message state and the SID-dedupe set whenever the caller supplies a new initial message list (e.g. switching conversations).
   * @effect-deps initial (loader-provided message list; a new reference means the conversation/context changed)
   * @effect-side-effects none — synchronizes initialRef/messageIdsRef and calls setMessages
   * @effect-why-not-loader `initial` already comes from a loader; this effect only re-derives local realtime bookkeeping (the dedupe set) each time that loader data changes, which isn't itself a fetch.
   */
  useEffect(() => {
    initialRef.current = initial;
    messageIdsRef.current = new Set(initial.map(msg => msg?.sid));
    setMessages(initial);
  }, [initial]);

  /**
   * @effect Keep a ref to the active contact_number filter so the realtime message handler always reads the current value.
   * @effect-deps contact_number (filter prop, changes when the user switches contacts)
   * @effect-side-effects none — updates contactNumberRef only
   * @effect-why-not-loader Local ref bookkeeping to avoid a stale closure inside handleMessageChange; not data fetching.
   */
  useEffect(() => {
    contactNumberRef.current = contact_number;
  }, [contact_number]);

  const handleMessageChange = useCallback((payload: RealtimeChangePayload<Record<string, unknown>>) => {
    const typedPayload = payload as RealtimeChangePayload<Tables<"message">>;
    const newRow = typedPayload.new as Tables<"message"> | null;
    if (!newRow?.workspace || newRow.workspace !== workspace) return;

    const currentContactNumber = contactNumberRef.current;
    const isForContact = !currentContactNumber ||
      phoneNumbersMatch(newRow.from, currentContactNumber) ||
      phoneNumbersMatch(newRow.to, currentContactNumber);
    if (!isForContact) return;

    if (typedPayload.eventType === "INSERT") {
      setMessages((curr) => {
        const newMessage = newRow as Message;
        if (!newMessage?.sid || messageIdsRef.current.has(newMessage.sid)) {
          return curr;
        }
        messageIdsRef.current.add(newMessage.sid);
        // Replace pending message with same body/from/to if present
        const withoutMatchingPending = curr.filter((m) => {
          if (!m?.sid?.startsWith?.("pending-")) return true;
          return !(
            m.body === newMessage.body &&
            phoneNumbersMatch(m.from, newMessage.from) &&
            phoneNumbersMatch(m.to, newMessage.to)
          );
        });
        return [...withoutMatchingPending, newMessage];
      });
    } else if (payload.eventType === "UPDATE" && newRow?.sid) {
      setMessages((curr) =>
        curr.map((m) =>
          m?.sid === newRow?.sid ? (newRow as Message) : m
        )
      );
    }
  }, [workspace]);

  const addOptimisticMessage = useCallback(
    (params: {
      body: string;
      from: string;
      to: string;
      media?: string;
      sid?: string;
    }) => {
      const mediaArr = params.media ? JSON.parse(params.media || "[]") : [];
      const pending = {
        sid: params.sid ?? `pending-${Date.now()}`,
        body: params.body,
        from: params.from,
        to: params.to,
        workspace,
        direction: "outbound",
        status: "sending",
        date_created: new Date().toISOString(),
        inbound_media: [],
        num_media: String(mediaArr.length),
        outreach_attempt_id: null,
      } as unknown as Message;
      setMessages((curr) => [...curr, pending]);
    },
    [workspace]
  );

  /** Flip a still-pending optimistic message (by sid) to "failed" so it renders as undelivered. */
  const markOptimisticMessageFailed = useCallback((sid: string) => {
    setMessages((curr) =>
      curr.map((m) => (m?.sid === sid ? ({ ...m, status: "failed" } as Message) : m)),
    );
  }, []);

  useWorkspaceEventSubscription({
    workspaceId: workspace,
    table: "message",
    filter: `workspace=eq.${workspace}`,
    onChange: handleMessageChange as (p: RealtimeChangePayload<Record<string, unknown>>) => void
  });

  return { messages, setMessages, addOptimisticMessage, markOptimisticMessageFailed };
};

/**
 * Hook for managing real-time conversation summaries
 * 
 * Subscribes to Postgres realtime changes for messages and automatically updates
 * conversation summaries including unread counts, message counts, and last update times.
 * Handles debounced fetching of conversation summaries to prevent excessive API calls.
 * Tracks active conversation to mark messages as read.
 * 
 * Features:
 * - Automatic realtime subscription to message table
 * - Unread count tracking and updates
 * - Conversation creation for new contacts
 * - Active conversation detection (marks as read)
 * - Debounced summary fetching (2-second interval)
 * - Automatic sorting by most recent conversation
 * 
 * @param params - Configuration object
 * @param params.client - Postgres client instance
 * @param params.initial - Initial list of conversation summaries
 * @param params.workspace - Workspace ID to filter messages
 * @param params.activeContactNumber - Optional active contact phone number (marks as read)
 * 
 * @returns Object containing:
 *   - conversations: Current list of conversation summaries
 *   - setConversations: Setter for conversations (use with caution)
 *   - fetchConversationSummary: Function to manually refresh summaries (with debouncing)
 * 
 * @example
 * ```tsx
 * const { conversations, fetchConversationSummary } = useConversationSummaryRealTime({
 *    *   initial: initialConversations,
 *   workspace: workspaceId,
 *   activeContactNumber: currentContact?.phone,
 * });
 * 
 * // Manually refresh summaries (will be debounced)
 * await fetchConversationSummary(true);
 * ```
 */
export const useConversationSummaryRealTime = ({
    initial,
  workspace,
  activeContactNumber,
}: {
  initial: ConversationSummary[];
  workspace: string;
  activeContactNumber?: string; // Add this to track the active conversation
}) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>(initial);
  const initialRef = useRef(initial);
  const isFetchingRef = useRef(false);
  const phoneNumbersRef = useRef(new Set(initial.map(conv => conv.contact_phone)));
  const activeContactRef = useRef(activeContactNumber);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  /**
   * @effect Keep a ref to the active contact number so the realtime message handler always reads the currently-open conversation without a stale closure.
   * @effect-deps activeContactNumber (which conversation is open; changes as the user navigates between chats)
   * @effect-side-effects none — updates activeContactRef only
   * @effect-why-not-loader Local ref bookkeeping to avoid stale closures in handleMessageChange; not data fetching.
   */
  useEffect(() => {
    activeContactRef.current = activeContactNumber;
  }, [activeContactNumber]);

  // Fetch conversation summary with debouncing to prevent excessive calls
  const fetchConversationSummary = useCallback(async (force = false) => {
    // Debounce fetches to prevent excessive calls (only fetch every 2 seconds unless forced)
    const now = Date.now();
    if (!force && now - lastUpdateTimeRef.current < 2000) {
      return;
    }
    
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    lastUpdateTimeRef.current = now;
    
    try {
      const data = await fetchConversationSummaries(workspace);
      const filteredData = data.filter((item): item is ConversationSummary => item !== null);

      const processedData = filteredData.map(conv => {
        if (activeContactRef.current &&
            phoneNumbersMatch(conv.contact_phone, activeContactRef.current)) {
          return {
            ...conv,
            unread_count: 0,
          };
        }
        return conv;
      });

      processedData.sort(compareByRecentActivity);
      setConversations(processedData);
      phoneNumbersRef.current = new Set(processedData.map(conv => conv.contact_phone));
    } catch (error) {
      logger.error("Error fetching conversation summary:", error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [workspace]);

  /**
   * @effect Resync `conversations` from the caller-supplied `initial` list when the loader gives us a materially different set (new/removed contacts or a changed count).
   * @effect-deps initial (loader data — always reacted to via reference change); conversations.length (used only as a coarse "did the set size change" check, intentionally NOT the full `conversations` object — see tradeoff below)
   * @effect-side-effects none — recomputes and calls setConversations when the phone-number set or length diverges from `initial`
   * @effect-why-not-loader `initial` is already loader data; this effect exists purely to reconcile it against realtime-mutated local state, which a loader can't do on its own.
   *
   * Known tradeoff (assessed, not changed): depending on the full `conversations` object instead of `conversations.length`
   * would make this effect re-fire on every realtime-driven `setConversations` call (unread bumps, new conversations from
   * handleMessageChange), and it would then be free to overwrite those local-only changes with stale `initial` data whenever
   * the phone-number-set/length heuristic happened not to catch the difference — a strictly worse regression (losing live
   * updates) than the one it fixes. Because a live realtime subscription + a 60s poll fallback (see
   * `fetchConversationSummary` effect below) already keep `conversations` fresh, the bounded miss here (an `initial` change
   * that alters existing-conversation content, e.g. message_count/timestamps, without changing the phone-number set or
   * count) self-heals within one poll cycle. Kept as `[initial, conversations.length]` with a justified
   * eslint-disable rather than widening the dependency.
   */
  useEffect(() => {
    const newPhoneNumbers = new Set(initial.map(conv => conv.contact_phone));
    // Only update if phone numbers changed or length changed
    if (!setsAreEqual(phoneNumbersRef.current, newPhoneNumbers) || initial.length !== conversations.length) {
      phoneNumbersRef.current = newPhoneNumbers;
      initialRef.current = initial;

      // Sort by most recent first
      const sortedConversations = [...initial].sort(compareByRecentActivity);

      setConversations(sortedConversations);
    }
  }, [initial, conversations.length]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally excludes full `conversations` object; see @effect-why-not-loader tradeoff note above

  // Handle new messages and message status changes
  const handleMessageChange = useCallback((payload: RealtimeChangePayload<Record<string, unknown>>) => {
    const typedPayload = payload as RealtimeChangePayload<Tables<"message">>;
    const newRow = typedPayload.new;
    if (typedPayload.eventType === 'INSERT' && newRow?.workspace === workspace) {
      if (!newRow) return;

      // For new messages, we need to update unread counts
      if (newRow.status === "received") {
        // Check if this is for the active contact
        const isForActiveContact = activeContactRef.current &&
          (phoneNumbersMatch(newRow.from, activeContactRef.current) ||
           phoneNumbersMatch(newRow.to, activeContactRef.current));

        // If it's not for the active contact, we need to increment unread count
        if (!isForActiveContact) {
          // Find the conversation for this contact
          setConversations(prevConversations => {
            // Determine the contact phone number (the one that's not a workspace number)
            const contactPhone =
              (newRow.direction === 'inbound' ? newRow.from : newRow.to) ?? "";

            // Check if we already have a conversation for this contact
            const existingConversationIndex = prevConversations.findIndex(conv =>
              phoneNumbersMatch(conv.contact_phone, contactPhone)
            );

            if (existingConversationIndex >= 0) {
              // Update existing conversation
              const updatedConversations = [...prevConversations];
              const existingConversation = updatedConversations[existingConversationIndex];
              if (!existingConversation) {
                return prevConversations;
              }
              updatedConversations[existingConversationIndex] = {
                ...existingConversation,
                unread_count: existingConversation.unread_count + 1,
                conversation_last_update: newRow.date_created || new Date().toISOString(),
                message_count: existingConversation.message_count + 1
              };
              return updatedConversations;
            } else {
              // Create a new conversation entry
              const newConversation: ConversationSummary = {
                contact_phone: contactPhone,
                user_phone:
                  (newRow.direction === 'inbound'
                    ? newRow.to
                    : newRow.from) ?? "",
                conversation_start: newRow.date_created || new Date().toISOString(),
                conversation_last_update: newRow.date_created || new Date().toISOString(),
                message_count: 1,
                unread_count: 1,
                contact_firstname: '',  // We don't have this info yet
                contact_surname: ''     // We don't have this info yet
              };

              // Add the new conversation and sort by most recent
              const updatedConversations = [...prevConversations, newConversation].sort(
                compareByRecentActivity,
              );

              return updatedConversations;
            }
          });
        }
      }

      // For status changes, refresh the conversation summary
      if (newRow.status === "delivered" || newRow.status === "read") {
        // For delivered/read status, we need to update unread counts
        setConversations(prevConversations => {
          // Early return if no conversations match
          const hasMatchingConversation = prevConversations.some(conv =>
            phoneNumbersMatch(conv.contact_phone, newRow.from) ||
            phoneNumbersMatch(conv.contact_phone, newRow.to)
          );

          if (!hasMatchingConversation) {
            return prevConversations;
          }

          return prevConversations.map(conv => {
            // Check if this message is from/to this conversation's contact
            if (phoneNumbersMatch(conv.contact_phone, newRow.from) ||
                phoneNumbersMatch(conv.contact_phone, newRow.to)) {
              // Decrement unread count (but not below 0)
              return {
                ...conv,
                unread_count: Math.max(0, conv.unread_count - 1)
              };
            }
            return conv;
          });
        });
      }

      // Store the last time we received a message change
      lastUpdateTimeRef.current = Date.now();

      // Clear any existing timeout to prevent multiple calls
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Use a longer delay to allow multiple messages to be processed together
      // and prevent excessive refreshes
      timeoutRef.current = setTimeout(() => {
        // Only fetch if it's been at least 2 seconds since the last fetch
        const now = Date.now();
        if (now - lastUpdateTimeRef.current >= 2000) {
          fetchConversationSummary();
        }
      }, 2000);
    }
  }, [workspace, fetchConversationSummary]);

  // Subscribe to message changes
  useWorkspaceEventSubscription({
    workspaceId: workspace,
    table: "message",
    filter: `workspace=eq.${workspace}`,
    onChange: handleMessageChange,
  });

  /**
   * @effect Fetch conversation summaries immediately on mount, then poll every 60s as a fallback in case realtime events are missed/coalesced.
   * @effect-deps fetchConversationSummary (useCallback memoized on [workspace] — resubscribes the timer if the workspace changes)
   * @effect-side-effects timer (setInterval, 60s) + fetch (fetchConversationSummary network call); interval cleared and any pending debounce timeout cleared on cleanup
   * @effect-why-not-loader The interval itself needs a live component-lifetime timer, which loaders/fetchers can't express; only the underlying network call is "fetching," and it exists here as a polling fallback alongside the realtime subscription and debounced on-event fetch (handleMessageChange), not as the primary data source. The immediate on-mount call is somewhat redundant with the loader-seeded `initial` prop but is left as-is (low cost, keeps summaries fresh if `initial` was stale by the time this hook mounts).
   */
  useEffect(() => {
    // Initial fetch
    fetchConversationSummary(true);

    // Set up periodic refresh (every 60 seconds)
    const intervalId = setInterval(() => {
      fetchConversationSummary(true);
    }, 60000);
    
    return () => {
      clearInterval(intervalId);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [fetchConversationSummary]);

  // Mark all messages as read for the active contact
  const markConversationAsRead = useCallback(async (contactPhone: string) => {
    if (!contactPhone) return;

    try {
      await markConversationRead(workspace, contactPhone);
      fetchConversationSummary(true);
    } catch (err) {
      logger.error("Error in markConversationAsRead:", err);
    }
  }, [workspace, fetchConversationSummary]);

  return { 
    conversations, 
    setConversations, 
    refreshConversations: fetchConversationSummary,
    markConversationAsRead
  };
};

// Helper function to compare sets
function setsAreEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
