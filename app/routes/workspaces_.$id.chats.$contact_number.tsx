import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  json,
  useFetcher,
  useLoaderData,
  useOutletContext,
} from "@remix-run/react";
import { findPotentialContacts, getUserRole } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { useEffect, useRef, useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useChatRealTime } from "~/hooks/useChatRealtime";
import { MdSend } from "react-icons/md";
import { useIntersectionObserver } from "~/hooks/useIntersectionOverserver";
import { stripPhoneNumber } from "~/lib/utils";

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
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const contact_number = params.contact_number;
  if (workspaceId == null) {
    return json(
      {
        workspace: null,
        error: "Workspace does not exist",
        userRole: null,
      },
      { headers },
    );
  }

  const userRole = getUserRole({ serverSession, workspaceId });
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select(`*, workspace_number(*)`)
    .eq("id", workspaceId)
    .single();

  const { data: messagesData, error: messagesError } = await supabaseClient
    .from("message")
    .select()
    .or(`from.eq.${contact_number}, to.eq.${contact_number}`)
    .order('date_created', {ascending: true})
    ;

  const messages = await getMessageMedia({
    messages: messagesData,
    supabaseClient,
  });

  if ([messagesError, workspaceError].filter(Boolean).length) {
    return json(
      {
        scripts: null,
        error: [messagesError, workspaceError]
          .filter(Boolean)
          .map((error) => error.message)
          .join(", "),
        userRole,
      },
      { headers },
    );
  }
  const initialFrom =
    messages?.length > 0 && messages[0].from === contact_number
      ? messages[0].to
      : messages[0].from;
  const { data: potentialContacts } = await findPotentialContacts(
    supabaseClient,
    initialFrom,
    workspaceId,
  );

  return json(
    {
      messages,
      workspace,
      error: null,
      userRole,
      initialFrom,
      potentialContacts,
      contact_number,
    },
    { headers },
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const contact_number = params.contact_number;
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const res = await fetch(`${process.env.BASE_URL}/api/chat_sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      body: data.body,
      to_number: contact_number,
      caller_id: data.from,
      workspace_id: workspaceId,
      contact_id: data.contact_id,
    }),
  });
  const responseData = await res.json();
  return json({ responseData });
}

export default function ChatScreen() {
  const {
    messages: initMessages,
    error,
    userRole,
    workspace,
    initialFrom,
    potentialContacts,
    contact_number,
  } = useLoaderData();
  const { supabase } = useOutletContext<{ supabase: SupabaseClient }>();
  const messagesEndRef = useRef(null);
  const initialContact =
    initMessages.length > 0 &&
    initMessages.find((message) => message.contact_id !== null)?.id;
  const [selectedContact, setSelectedContact] = useState(initialContact);
  const { messages, setMessages } = useChatRealTime({
    supabase,
    initial: initMessages,
    workspace: workspace.id,
  });
  const fetcher = useFetcher();

  const updateMessageStatus = async (messageId) => {
    const { data, error } = await supabase
      .from('message')
      .update({ status: 'delivered' })
      .eq('sid', messageId);

    if (error) {
      console.error('Error updating message status:', error);
    } else {
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.sid === messageId ? { ...msg, status: 'delivered' } : msg
        )
      );
    }
  };


  const observerCallback = (target) => {
    const messageId = target.dataset.messageId;
    const messageStatus = target.dataset.messageStatus;
    if (messageStatus === 'received') {
      updateMessageStatus(messageId);
    }
  };

  const observer = useIntersectionObserver(observerCallback);

  useEffect(() => {
    const messageElements = document.querySelectorAll('.message-item');
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
    <div className="flex h-full flex-col bg-gray-100">
      <div className="sticky top-0 z-10 bg-white shadow">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-xl font-semibold">Chat</h2>
          {potentialContacts.length > 0 ? (
            <select
              name="contact"
              value={selectedContact}
              onChange={(e) => setSelectedContact(e.currentTarget.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {potentialContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.firstname} {contact.surname} - {contact.phone}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-lg font-medium">{contact_number}</div>
          )}
        </div>
      </div>

      <div className="overflow-y-auto p-4 h-[400px]">
        {messages?.length > 0 ? (
          messages.map((message, index) => (
            <div
              key={index}
              className={`message-item mb-4 flex ${
                message.direction !== "inbound" ? "justify-end" : "justify-start"
              }`}
              data-message-id={message.sid}
              data-message-status={message.status}
            >
              <div
                className={`max-w-[70%] rounded-lg p-3 ${
                  message.direction !== "inbound"
                    ? "bg-secondary text-slate-900"
                    : "bg-white"
                }`}
              >
                <p className="text-sm">{message.body}</p>
                {message.signedUrls?.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Attachment ${i + 1}`}
                    className="mt-2 h-auto max-w-full rounded"
                  />
                ))}
                <div className="mt-1 text-right">
                  <small className="text-xs opacity-75">
                    {new Date(message.date_created).toLocaleTimeString()}
                  </small>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-gray-500">No messages yet</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t bg-white p-4">
        <fetcher.Form method="POST" className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2">
            <label htmlFor="from" className="text-sm font-medium">
              From:
            </label>
            <select
              name="from"
              id="from"
              defaultValue={initialFrom}
              className="flex-grow rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {workspace?.workspace_number?.map((num) => (
                <option
                  key={num.id}
                  
                  value={num.phone_number}
                >
                  {num.phone_number}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <textarea
              placeholder="Type your message"
              rows={3}
              className="flex-grow resize-none rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              name="body"
              id="body"
            />
            <button
              type="submit"
              disabled={fetcher.state !== "idle"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:bg-gray-400"
            >
              <MdSend size={20} />
            </button>
          </div>
          {selectedContact && (
            <input
              hidden
              value={selectedContact.id}
              type="hidden"
              name="contact_id"
            />
          )}
        </fetcher.Form>
      </div>
    </div>
  );
}
