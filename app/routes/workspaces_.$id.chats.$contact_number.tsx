import { LoaderFunctionArgs } from "@remix-run/node";
import { json, useLoaderData, useOutletContext, useParams } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { useEffect, useRef } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useChatRealTime } from "@/hooks/realtime/useChatRealtime";
import { useIntersectionObserver } from "@/hooks/utils/useIntersectionObserver";
import MessageList from "../../components/chat/ChatMessages";
import { Message, Workspace, WorkspaceNumber } from "@/lib/types";
import { normalizePhoneNumber } from "@/lib/utils";

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
  let normalizedNumber = null;

  if (contact_number !== "new") {
    try {
      // Try to normalize the phone number for more consistent querying
      normalizedNumber = normalizePhoneNumber(contact_number || "");
      
      // Create a query with multiple OR conditions to match different phone number formats
      const { data: messagesData, error: messagesError } = await supabaseClient
        .from("message")
        .select(`*, outreach_attempt(campaign_id)`)
        .or(`from.eq.${normalizedNumber},to.eq.${normalizedNumber}`)
        .eq('workspace', id as string)
        .not('date_created', 'is', null)
        .neq('status', 'failed')
        .order("date_created", { ascending: true });
      
      if (messagesError) {
        console.error("Error fetching messages:", messagesError);
      } else {
        messages.push(
          ...(await getMessageMedia({
            messages: messagesData as Message[],
            supabaseClient,
          })),
        );
      }
    } catch (error) {
      console.error("Error processing contact number:", error);
      // If normalization fails, still try to fetch with the raw number
      const { data: messagesData, error: messagesError } = await supabaseClient
        .from("message")
        .select(`*, outreach_attempt(campaign_id)`)
        .or(`from.eq.${contact_number},to.eq.${contact_number}`)
        .eq('workspace', id as string)
        .not('date_created', 'is', null)
        .neq('status', 'failed')
        .order("date_created", { ascending: true });
      
      if (!messagesError) {
        messages.push(
          ...(await getMessageMedia({
            messages: messagesData as Message[],
            supabaseClient,
          })),
        );
      }
    }

    // Mark messages as read on the server side when loading the conversation
    if (normalizedNumber) {
      try {
        // Update all received messages for this contact to delivered
        await supabaseClient
          .from("message")
          .update({ status: "delivered" })
          .eq("workspace", id as string)
          .eq("status", "received")
          .or(`from.eq.${normalizedNumber},to.eq.${normalizedNumber}`);
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    }
  }

  return json(
    {
      messages,
      contact_number: normalizedNumber || contact_number,
    },
    { headers },
  );
}

export default function ChatScreen() {
  const { supabase, workspace, workspaceNumbers } = useOutletContext<{ supabase: SupabaseClient, workspace: NonNullable<Workspace>, workspaceNumbers: WorkspaceNumber[] }>();
  const { messages: initialMessages, contact_number: loaderContactNumber } = useLoaderData<{ messages: Message[], contact_number: string }>();
  const { contact_number: paramContactNumber } = useParams();
  
  // Use the contact number from the loader (which might be normalized) or fall back to the param
  const contact_number = loaderContactNumber || paramContactNumber;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef<number>(initialMessages.length);
  const scrollPositionRef = useRef<number>(0);
  const hasMarkedAsReadRef = useRef<boolean>(false);

  const { messages, setMessages } = useChatRealTime({
    supabase,
    initial: initialMessages,
    workspace: workspace.id,
    contact_number,
  });

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
          console.error("Error marking messages as read:", error);
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
        console.error("Error in markMessagesAsRead:", err);
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
      console.error("Error updating message status:", error);
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

  const { observe, unobserve } = useIntersectionObserver(observerCallback, { threshold: 0.5 });

  // Handle intersection observer setup once
  useEffect(() => {
    const messageElements = document.querySelectorAll<HTMLElement>(".message-item");
    messageElements.forEach((el) => observe(el));

    return () => {
      messageElements.forEach((el) => unobserve(el));
    };
  }, [observe, unobserve]); // Only re-run when observe/unobserve change

  // Handle new message elements
  useEffect(() => {
    // Only observe new messages
    const messageElements = document.querySelectorAll<HTMLElement>(".message-item");
    const newMessages = Array.from(messageElements).slice(lastMessageCountRef.current);
    
    newMessages.forEach((el) => observe(el));
    lastMessageCountRef.current = messageElements.length;

    return () => {
      newMessages.forEach((el) => unobserve(el));
    };
  }, [messages, observe, unobserve]);

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
