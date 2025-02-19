import { LoaderFunctionArgs } from "@remix-run/node";
import { json, useLoaderData, useOutletContext } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { useEffect, useRef } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useChatRealTime } from "~/hooks/useChatRealtime";
import { useIntersectionObserver } from "~/hooks/useIntersectionOverserver";
import MessageList from "~/components/Chat/ChatMessages";
import { Message, Workspace, WorkspaceNumber } from "~/lib/types";

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
  const { supabase, workspace, workspaceNumbers } = useOutletContext<{ supabase: SupabaseClient, workspace: NonNullable<Workspace>, workspaceNumbers: WorkspaceNumber[] }>();
  const { messages: initialMessages } = useLoaderData<{ messages: Message[] }>();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef<number>(initialMessages.length);
  const scrollPositionRef = useRef<number>(0);

  const { messages, setMessages } = useChatRealTime({
    supabase,
    initial: initialMessages,
    workspace: workspace.id,
  });

  const updateMessageStatus = async (messageId: string) => {
    const { error } = await supabase
      .from("message")
      .update({ status: "delivered" })
      .eq("sid", messageId);

    if (error) {
      console.error("Error updating message status:", error);
    } else {
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg?.sid === messageId ? { ...msg, status: "delivered" } : msg,
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

  // Handle intersection observer setup once
  useEffect(() => {
    if (!observer) return;

    const messageElements = document.querySelectorAll<HTMLElement>(".message-item");
    messageElements.forEach((el) => observer.observe(el));

    return () => {
      messageElements.forEach((el) => observer.unobserve(el));
    };
  }, [observer]); // Only re-run when observer changes

  // Handle new message elements
  useEffect(() => {
    if (!observer) return;

    // Only observe new messages
    const messageElements = document.querySelectorAll<HTMLElement>(".message-item");
    const newMessages = Array.from(messageElements).slice(lastMessageCountRef.current);
    
    newMessages.forEach((el) => observer.observe(el));
    lastMessageCountRef.current = messageElements.length;

    return () => {
      newMessages.forEach((el) => observer.unobserve(el));
    };
  }, [messages, observer]);

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
      <MessageList messages={messages} messagesEndRef={messagesEndRef} />
    </div>
  );
}
