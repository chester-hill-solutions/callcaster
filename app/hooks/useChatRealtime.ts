import { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState, useCallback, useRef } from "react";
import type { Message } from "~/lib/types";
import type { Database } from "~/lib/database.types";
import { useSupabaseRealtimeSubscription } from "./useSupabaseRealtime";

type ConversationSummary = NonNullable<Database["public"]["Functions"]["get_conversation_summary"]["Returns"][number]>;
type ChatMessage = NonNullable<Message> & {
  signedUrls?: (string | undefined)[];
};

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

export const useChatRealTime = ({
  supabase,
  initial,
  workspace,
  contact_number,
}: {
  supabase: SupabaseClient<Database>;
  initial: ChatMessage[];
  workspace: string;
  contact_number?: string;
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
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

  const handleMessageChange = useCallback((payload: any) => {
    if (payload.new?.workspace === workspace) {
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
        const newMessage = payload.new as ChatMessage;
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

export const useConversationSummaryRealTime = ({
  supabase,
  initial,
  workspace,
  activeContactNumber,
  campaignId,
  hasInboundOnly = false,
}: {
  supabase: SupabaseClient<Database>;
  initial: ConversationSummary[];
  workspace: string;
  activeContactNumber?: string; // Add this to track the active conversation
  campaignId?: string | null;
  hasInboundOnly?: boolean;
}) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    () => sortConversations(initial),
  );
  const activeContactRef = useRef(activeContactNumber);
  const campaignIdRef = useRef(campaignId);
  const hasInboundOnlyRef = useRef(hasInboundOnly);
  
  // Update active contact ref when it changes
  useEffect(() => {
    activeContactRef.current = activeContactNumber;
  }, [activeContactNumber]);

  useEffect(() => {
    campaignIdRef.current = campaignId;
  }, [campaignId]);

  useEffect(() => {
    hasInboundOnlyRef.current = hasInboundOnly;
  }, [hasInboundOnly]);

  // Update conversations when initial data changes
  useEffect(() => {
    const sortedConversations = sortConversations(initial);
    setConversations(sortedConversations);
  }, [initial]);

  // Handle new messages and message status changes
  const handleMessageChange = useCallback((payload: any) => {
    if (payload.new?.workspace === workspace) {
      if (payload.new.status === "failed") {
        return;
      }

      const contactPhone =
        payload.new.direction === "inbound" ? payload.new.from : payload.new.to;
      const userPhone =
        payload.new.direction === "inbound" ? payload.new.to : payload.new.from;

      if (!contactPhone || !userPhone) {
        return;
      }

      const isForActiveContact =
        activeContactRef.current &&
        (phoneNumbersMatch(contactPhone, activeContactRef.current) ||
          phoneNumbersMatch(userPhone, activeContactRef.current));

      setConversations((prevConversations) => {
        const existingConversationIndex = prevConversations.findIndex((conv) =>
          phoneNumbersMatch(conv.contact_phone, contactPhone),
        );
        const matchesCampaign = campaignIdRef.current
          ? String(payload.new.campaign_id ?? "") === campaignIdRef.current
          : true;
        const matchesInboundFilter =
          !hasInboundOnlyRef.current || payload.new.direction === "inbound";

        if (existingConversationIndex === -1 && (!matchesCampaign || !matchesInboundFilter)) {
          return prevConversations;
        }

        if (existingConversationIndex >= 0) {
          const updatedConversations = [...prevConversations];
          const existingConversation =
            updatedConversations[existingConversationIndex];
          const isNewMessage = payload.eventType === "INSERT";
          const unreadIncrement =
            isNewMessage &&
            payload.new.status === "received" &&
            !isForActiveContact
              ? 1
              : 0;

          updatedConversations[existingConversationIndex] = {
            ...existingConversation,
            user_phone: existingConversation.user_phone || userPhone,
            conversation_last_update:
              payload.new.date_created || existingConversation.conversation_last_update,
            message_count: isNewMessage
              ? existingConversation.message_count + 1
              : existingConversation.message_count,
            unread_count:
              payload.new.status === "delivered" || payload.new.status === "read"
                ? Math.max(0, existingConversation.unread_count - 1)
                : existingConversation.unread_count + unreadIncrement,
          };

          return sortConversations(updatedConversations);
        }

        const unreadCount =
          payload.new.status === "received" && !isForActiveContact ? 1 : 0;
        const newConversation: ConversationSummary = {
          contact_phone: contactPhone,
          user_phone: userPhone,
          conversation_start: payload.new.date_created || new Date().toISOString(),
          conversation_last_update:
            payload.new.date_created || new Date().toISOString(),
          message_count: payload.eventType === "INSERT" ? 1 : 0,
          unread_count: unreadCount,
          contact_firstname: "",
          contact_surname: "",
        };

        return sortConversations([...prevConversations, newConversation]);
      });
    }
  }, [workspace]);

  // Subscribe to message changes
  useSupabaseRealtimeSubscription({
    supabase,
    table: "message",
    filter: `workspace=eq.${workspace}`,
    onChange: handleMessageChange
  });

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
        setConversations((prevConversations) =>
          prevConversations.map((conversation) =>
            phoneNumbersMatch(conversation.contact_phone, contactPhone)
              ? { ...conversation, unread_count: 0 }
              : conversation,
          ),
        );
      }
    } catch (err) {
      console.error("Error in markConversationAsRead:", err);
    }
  }, [supabase, workspace]);

  return { 
    conversations, 
    setConversations, 
    markConversationAsRead
  };
};

function sortConversations(conversations: ConversationSummary[]) {
  return [...conversations].sort((a, b) => {
    return (
      new Date(b.conversation_last_update).getTime() -
      new Date(a.conversation_last_update).getTime()
    );
  });
}

