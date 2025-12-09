import { SupabaseClient, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect, useState, useCallback, useRef } from "react";
import type { Message } from "@/lib/types";
import type { Database, Tables } from "@/lib/database.types";
import { useSupabaseRealtimeSubscription } from "./useSupabaseRealtime";

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
 * Subscribes to Supabase realtime changes for messages in a workspace, automatically
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
 * @param params.supabase - Supabase client instance
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
 *   supabase,
 *   initial: initialMessages,
 *   workspace: workspaceId,
 *   contact_number: contactPhone,
 * });
 * ```
 */
export const useChatRealTime = ({
  supabase,
  initial,
  workspace,
  contact_number,
}: {
  supabase: SupabaseClient<Database>;
  initial: Message[];
  workspace: string;
  contact_number?: string;
}) => {
  const [messages, setMessages] = useState<Message[]>(initial);
  const initialRef = useRef(initial);
  const messageIdsRef = useRef(new Set(initial.map(msg => msg?.sid)));
  const contactNumberRef = useRef(contact_number);

  // Update refs when props change
  useEffect(() => {
    initialRef.current = initial;
    messageIdsRef.current = new Set(initial.map(msg => msg?.sid));
    setMessages(initial);
  }, [initial]);

  useEffect(() => {
    contactNumberRef.current = contact_number;
  }, [contact_number]);

  const handleMessageChange = useCallback((payload: RealtimePostgresChangesPayload<Tables<"message">>) => {
    if (payload.eventType === 'INSERT' && payload.new?.workspace === workspace) {
      if (payload.new.status === "failed") return;
      
      // If contact_number is provided, only add messages for this contact
      const currentContactNumber = contactNumberRef.current;
      if (currentContactNumber) {
        const isFromContact = phoneNumbersMatch(payload.new.from, currentContactNumber);
        const isToContact = phoneNumbersMatch(payload.new.to, currentContactNumber);
        
        if (!isFromContact && !isToContact) {
          // Message is not related to this contact
          return;
        }
      }
      
      setMessages((curr) => {
        const newMessage = payload.new as Message;
        if (!newMessage?.sid || messageIdsRef.current.has(newMessage.sid)) {
          return curr;
        }
        messageIdsRef.current.add(newMessage.sid);
        return [...curr, newMessage];
      });
    }
  }, [workspace]); // Remove contact_number dependency since we use the ref

  useSupabaseRealtimeSubscription({
    supabase,
    table: "message",
    filter: `workspace=eq.${workspace}`,
    onChange: handleMessageChange
  });

  return { messages, setMessages };
};

/**
 * Hook for managing real-time conversation summaries
 * 
 * Subscribes to Supabase realtime changes for messages and automatically updates
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
 * @param params.supabase - Supabase client instance
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
 *   supabase,
 *   initial: initialConversations,
 *   workspace: workspaceId,
 *   activeContactNumber: currentContact?.phone,
 * });
 * 
 * // Manually refresh summaries (will be debounced)
 * await fetchConversationSummary(true);
 * ```
 */
export const useConversationSummaryRealTime = ({
  supabase,
  initial,
  workspace,
  activeContactNumber,
}: {
  supabase: SupabaseClient<Database>;
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
  
  // Update active contact ref when it changes
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
      const { data, error } = await supabase.rpc("get_conversation_summary", {
        p_workspace: workspace,
      });
      if (error) {
        console.error("Error fetching conversation summary:", error);
        // Don't throw, just return early to prevent breaking the UI
        // The error is logged for debugging purposes
        return;
      }
      if (data) {
        const filteredData = data.filter((item): item is ConversationSummary => item !== null);
        
        // Process the data to update unread counts
        const processedData = filteredData.map(conv => {
          // If this is the active conversation, we can assume messages are being read
          if (activeContactRef.current && 
              phoneNumbersMatch(conv.contact_phone, activeContactRef.current)) {
            return {
              ...conv,
              unread_count: 0 // Mark as read for the active conversation
            };
          }
          return conv;
        });
        
        // Sort conversations by most recent first
        processedData.sort((a, b) => {
          return new Date(b.conversation_last_update).getTime() - 
                 new Date(a.conversation_last_update).getTime();
        });
        
        setConversations(processedData);
        
        // Update the phone numbers set for future comparisons
        phoneNumbersRef.current = new Set(processedData.map(conv => conv.contact_phone));
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [supabase, workspace]);

  // Update conversations when initial data changes
  useEffect(() => {
    const newPhoneNumbers = new Set(initial.map(conv => conv.contact_phone));
    // Only update if phone numbers changed or length changed
    if (!setsAreEqual(phoneNumbersRef.current, newPhoneNumbers) || initial.length !== conversations.length) {
      phoneNumbersRef.current = newPhoneNumbers;
      initialRef.current = initial;
      
      // Sort by most recent first
      const sortedConversations = [...initial].sort((a, b) => {
        return new Date(b.conversation_last_update).getTime() - 
               new Date(a.conversation_last_update).getTime();
      });
      
      setConversations(sortedConversations);
    }
  }, [initial, conversations.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle new messages and message status changes
  const handleMessageChange = useCallback(async (payload: RealtimePostgresChangesPayload<Tables<"message">>) => {
    if (payload.eventType === 'INSERT' && payload.new?.workspace === workspace) {
      // For new messages, we need to update unread counts
      if (payload.new.status === "received") {
        // Check if this is for the active contact
        const isForActiveContact = activeContactRef.current && 
          (phoneNumbersMatch(payload.new.from, activeContactRef.current) || 
           phoneNumbersMatch(payload.new.to, activeContactRef.current));
        
        // If it's not for the active contact, we need to increment unread count
        if (!isForActiveContact) {
          // Find the conversation for this contact
          setConversations(prevConversations => {
            // Determine the contact phone number (the one that's not a workspace number)
            const contactPhone = payload.new.direction === 'inbound' ? payload.new.from : payload.new.to;
            
            // Check if we already have a conversation for this contact
            const existingConversationIndex = prevConversations.findIndex(conv => 
              phoneNumbersMatch(conv.contact_phone, contactPhone)
            );
            
            if (existingConversationIndex >= 0) {
              // Update existing conversation
              const updatedConversations = [...prevConversations];
              updatedConversations[existingConversationIndex] = {
                ...updatedConversations[existingConversationIndex],
                unread_count: updatedConversations[existingConversationIndex].unread_count + 1,
                conversation_last_update: payload.new.date_created || new Date().toISOString(),
                message_count: updatedConversations[existingConversationIndex].message_count + 1
              };
              return updatedConversations;
            } else {
              // Create a new conversation entry
              const newConversation: ConversationSummary = {
                contact_phone: contactPhone,
                user_phone: payload.new.direction === 'inbound' ? payload.new.to : payload.new.from,
                conversation_start: payload.new.date_created || new Date().toISOString(),
                conversation_last_update: payload.new.date_created || new Date().toISOString(),
                message_count: 1,
                unread_count: 1,
                contact_firstname: '',  // We don't have this info yet
                contact_surname: ''     // We don't have this info yet
              };
              
              // Add the new conversation and sort by most recent
              const updatedConversations = [...prevConversations, newConversation].sort((a, b) => {
                return new Date(b.conversation_last_update).getTime() - 
                       new Date(a.conversation_last_update).getTime();
              });
              
              return updatedConversations;
            }
          });
        }
      }
      
      // For status changes, refresh the conversation summary
      if (payload.new.status === "delivered" || payload.new.status === "read") {
        // For delivered/read status, we need to update unread counts
        setConversations(prevConversations => {
          // Early return if no conversations match
          const hasMatchingConversation = prevConversations.some(conv => 
            phoneNumbersMatch(conv.contact_phone, payload.new.from) || 
            phoneNumbersMatch(conv.contact_phone, payload.new.to)
          );
          
          if (!hasMatchingConversation) {
            return prevConversations;
          }
          
          return prevConversations.map(conv => {
            // Check if this message is from/to this conversation's contact
            if (phoneNumbersMatch(conv.contact_phone, payload.new.from) || 
                phoneNumbersMatch(conv.contact_phone, payload.new.to)) {
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
  useSupabaseRealtimeSubscription({
    supabase,
    table: "message",
    filter: `workspace=eq.${workspace}`,
    onChange: handleMessageChange
  });

  // Periodically refresh conversations to ensure they're up to date
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
      // Update all received messages for this contact to delivered
      const { error } = await supabase
        .from("message")
        .update({ status: "delivered" })
        .eq("workspace", workspace)
        .eq("status", "received")
        .or(`from.eq.${contactPhone},to.eq.${contactPhone}`);
      
      if (error) {
        console.error("Error marking conversation as read:", error);
      } else {
        // Force refresh conversation summary to update unread counts
        fetchConversationSummary(true);
      }
    } catch (err) {
      console.error("Error in markConversationAsRead:", err);
    }
  }, [supabase, workspace, fetchConversationSummary]);

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
