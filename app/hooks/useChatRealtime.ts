import { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Message } from "~/lib/types";

export const useChatRealTime = ({
  supabase,
  initial,
  workspace,
}: {
  supabase: SupabaseClient;
  initial: Message[];
  workspace: string;
}) => {
  const [messages, setMessages] = useState(initial);
  useEffect(() => {
    setMessages(initial);
  }, [initial]);

  useEffect(() => {
    const subscription = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message" },
        (payload) => {
          if (payload.new.workspace === workspace) {
            setMessages((curr) => [...curr, payload.new]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [supabase, workspace]);

  return { messages, setMessages };
};

type ConversationSummary = {
  contact_phone: string;
  user_phone: string;
  conversation_start: string;
  conversation_last_update: string;
  message_count: number;
  unread_count: number;
};

export const useConversationSummaryRealTime = ({
  supabase,
  initial,
  workspace,
}: {
  supabase: SupabaseClient;
  initial: ConversationSummary[];
  workspace: string;
}) => {
  const [conversations, setConversations] =
    useState<ConversationSummary[]>(initial);

  useEffect(() => {
    const fetchConversationSummary = async () => {
      const { data, error } = await supabase.rpc("get_conversation_summary", {
        p_workspace: workspace,
      });
      if (error) {
        console.error("Error fetching conversation summary:", error);
      } else {
        setConversations(data);
      }
    };
    const subscription = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message" },
        (payload) => {
          if (payload.new.workspace === workspace) {
            fetchConversationSummary();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [supabase, workspace]);
  useEffect(() => {
    setConversations(initial);
  }, [initial]);
  return { conversations, setConversations };
};
