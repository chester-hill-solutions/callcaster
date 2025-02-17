import { LoaderFunctionArgs } from "@remix-run/node";
import { json, useLoaderData, useOutletContext } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { useEffect, useRef } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useChatRealTime } from "~/hooks/useChatRealtime";
import { useIntersectionObserver } from "~/hooks/useIntersectionOverserver";
import MessageList from "~/components/Chat/ChatMessages";
import { Message, WorkspaceData } from "~/lib/types";

const getMessageMedia = async ({ messages, supabaseClient }: { messages: Message[], supabaseClient: SupabaseClient }) => {
  return Promise.all(
    (messages ?? []).map(async (message: Message) => {
      const inboundMedia = message?.inbound_media ?? [];
      if (inboundMedia.filter(Boolean).length > 0) {
        const urls = await Promise.all(
          inboundMedia.map(async (file) => {
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
  const { supabaseClient, headers, user } = await verifyAuth(request);
  let messages = [];

  if (contact_number !== "new") {
    const { data: messagesData, error: messagesError } = await supabaseClient
      .from("message")
      .select(`*, outreach_attempt(campaign_id)`)
      .or(`from.eq.${contact_number}, to.eq.${contact_number}`)
      .eq('workspace', id as string)
      .not('date_created', 'is', null)
      .neq('status', 'failed')
      .order("date_created", { ascending: true });
    messages.push(
      ...(await getMessageMedia({
        messages: messagesData as Message[] ,
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
  const { supabase, workspace } = useOutletContext<{ supabase: SupabaseClient, workspace: WorkspaceData }>();
  const { messages: initialMessages } = useLoaderData<{ messages: Message[] }>();

  const messagesEndRef = useRef(null);

  const { messages, setMessages } = useChatRealTime({
    supabase,
    initial: initialMessages,
    workspace: workspace?.id as string,
  });

  const updateMessageStatus = async (messageId: string) => {
    const { data, error } = await supabase
      .from("message")
      .update({ status: "delivered" })
      .eq("sid", messageId);

    if (error) {
      console.error("Error updating message status:", error);
    } else {
      setMessages((prevMessages: Message[]) =>
        prevMessages.map((msg: Message) =>
          msg.sid === messageId ? { ...msg, status: "delivered" } : msg,
        ),
      );
    }
  };

  const observerCallback = (target: HTMLElement) => {
    const messageId = target.dataset.messageId;
    const messageStatus = target.dataset.messageStatus;
    if (messageStatus === "received") {
      updateMessageStatus(messageId as string);
    }
  };

  const observer = useIntersectionObserver(observerCallback);

  useEffect(() => {
    const messageElements = document.querySelectorAll(".message-item");
    messageElements.forEach((el) => {
      if (observer) {
        observer.observe(el as HTMLElement);
      }
    });

    return () => {
      if (observer) {
        messageElements.forEach((el) => observer.unobserve(el as HTMLElement));
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
