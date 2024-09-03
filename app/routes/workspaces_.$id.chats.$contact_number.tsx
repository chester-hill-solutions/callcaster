import { LoaderFunctionArgs } from "@remix-run/node";
import { json, useLoaderData, useOutletContext } from "@remix-run/react";
import { findPotentialContacts, getUserRole } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { useEffect, useRef } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useChatRealTime } from "~/hooks/useChatRealtime";
import { useIntersectionObserver } from "~/hooks/useIntersectionOverserver";
import MessageList from "~/components/Chat/ChatMessages";
import { Message } from "~/lib/types";

const getMessageMedia = async ({ messages, supabaseClient }) => {
  return Promise.all(
    messages?.map(async (message) => {
      if (message?.inbound_media?.filter(Boolean)?.length > 0) {
        const urls = await Promise.all(
          message.inbound_media.map(async (file) => {
            const { data, error } = await supabaseClient.storage
              .from("messageMedia")
              .createSignedUrl(file, 3600);
            return data?.signedUrl;
          }),
        );
        return { ...message, signedUrls: urls };
      } else {
        return { ...message, signedUrls: [] };
      }
    }),
  );
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const {id, contact_number} = params;
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  let messages = [];

  if (contact_number !== "new") {
    const { data: messagesData, error: messagesError } = await supabaseClient
      .from("message")
      .select(`*, outreach_attempt(campaign_id)`)
      .or(`from.eq.${contact_number}, to.eq.${contact_number}`)
      .eq('workspace', id)
      .not('date_created', 'is', null)
      .neq('status', 'failed')
      .order("date_created", { ascending: true });
    messages.push(
      ...(await getMessageMedia({
        messages: messagesData,
        supabaseClient,
      })),
    );
  }

  return json(
    {
      messages,
    },
    { headers },
  );
}

export default function ChatScreen() {
  const { supabase, workspace } = useOutletContext<{ supabase: SupabaseClient }>();
  const { messages: initialMessages,  } = useLoaderData<Message[]>();

  const messagesEndRef = useRef(null);

  const { messages, setMessages } = useChatRealTime({
    supabase,
    initial: initialMessages,
    workspace: workspace?.id,
  });

  const updateMessageStatus = async (messageId) => {
    const { data, error } = await supabase
      .from("message")
      .update({ status: "delivered" })
      .eq("sid", messageId);

    if (error) {
      console.error("Error updating message status:", error);
    } else {
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.sid === messageId ? { ...msg, status: "delivered" } : msg,
        ),
      );
    }
  };

  const observerCallback = (target) => {
    const messageId = target.dataset.messageId;
    const messageStatus = target.dataset.messageStatus;
    if (messageStatus === "received") {
      updateMessageStatus(messageId);
    }
  };

  const observer = useIntersectionObserver(observerCallback);

  useEffect(() => {
    const messageElements = document.querySelectorAll(".message-item");
    messageElements.forEach((el) => {
      if (observer) {
        observer.observe(el);
      }
    });

    return () => {
      if (observer) {
        messageElements.forEach((el) => observer.unobserve(el));
      }
    };
  }, [messages, observer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages} messagesEndRef={messagesEndRef} />
    </div>
  );
}
