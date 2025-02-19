import { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState, useCallback, useRef } from "react";
import type { Message } from "~/lib/types";
import type { Database } from "~/lib/database.types";
import { useSupabaseRealtimeSubscription } from "./useSupabaseRealtime";

type ConversationSummary = NonNullable<Database["public"]["Functions"]["get_conversation_summary"]["Returns"][number]>;

export const useChatRealTime = ({
  supabase,
  initial,
  workspace,
}: {
  supabase: SupabaseClient<Database>;
  initial: Message[];
  workspace: string;
}) => {
  const [messages, setMessages] = useState<Message[]>(initial);
  const initialRef = useRef(initial);
  const messageIdsRef = useRef(new Set(initial.map(msg => msg?.sid)));

  useEffect(() => {
    initialRef.current = initial;
    messageIdsRef.current = new Set(initial.map(msg => msg?.sid));
    setMessages(initial);
  }, [initial]);

  const handleMessageChange = useCallback((payload: any) => {
    if (payload.new?.workspace === workspace) {
      if (payload.new.status === "failed") return;
      
      setMessages((curr) => {
        const newMessage = payload.new as Message;
        if (!newMessage?.sid || messageIdsRef.current.has(newMessage.sid)) {
          return curr;
        }
        messageIdsRef.current.add(newMessage.sid);
        return [...curr, newMessage];
      });
    }
  }, [workspace]);

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
}: {
  supabase: SupabaseClient<Database>;
  initial: ConversationSummary[];
  workspace: string;
}) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>(initial);
  const initialRef = useRef(initial);
  const isFetchingRef = useRef(false);
  const phoneNumbersRef = useRef(new Set(initial.map(conv => conv.contact_phone)));

  const fetchConversationSummary = useCallback(async () => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    try {
      const { data, error } = await supabase.rpc("get_conversation_summary", {
        p_workspace: workspace,
      });
      if (error) {
        console.error("Error fetching conversation summary:", error);
        return;
      }
      if (data) {
        const filteredData = data.filter((item): item is ConversationSummary => item !== null);
        const newPhoneNumbers = new Set(filteredData.map(conv => conv.contact_phone));
        
        // Only update if the phone numbers have changed
        if (!setsAreEqual(phoneNumbersRef.current, newPhoneNumbers)) {
          phoneNumbersRef.current = newPhoneNumbers;
          setConversations(filteredData);
        }
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [supabase, workspace]);

  useEffect(() => {
    const newPhoneNumbers = new Set(initial.map(conv => conv.contact_phone));
    if (!setsAreEqual(phoneNumbersRef.current, newPhoneNumbers)) {
      phoneNumbersRef.current = newPhoneNumbers;
      initialRef.current = initial;
      setConversations(initial);
    }
  }, [initial]);

  const handleMessageChange = useCallback(async (payload: any) => {
    if (payload.new?.workspace === workspace && !isFetchingRef.current) {
      await fetchConversationSummary();
    }
  }, [workspace, fetchConversationSummary]);

  useSupabaseRealtimeSubscription({
    supabase,
    table: "message",
    filter: `workspace=eq.${workspace}`,
    onChange: handleMessageChange
  });

  return { 
    conversations, 
    setConversations, 
    refreshConversations: fetchConversationSummary 
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
