import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import {
  NavLink,
  Outlet,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useOutlet,
  useOutletContext,
  useSearchParams,
  useAsyncError,
} from "@remix-run/react";
import { MdAdd, MdChat } from "react-icons/md";
import { Button } from "~/components/ui/button";
import {
  ConversationSummaryPage,
  fetchCampaignsByType,
  fetchContactData,
  fetchConversationSummary,
  getUserRole,
} from "~/lib/database.server";
import { verifyAuth } from "~/lib/supabase.server";
import { normalizePhoneNumber } from "~/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "~/components/ui/card";
import { useConversationSummaryRealTime, phoneNumbersMatch } from "~/hooks/useChatRealtime";
import ChatHeader from "~/components/Chat/ChatHeader";
import ChatInput from "~/components/Chat/ChatInput";
import { useContactSearch } from "~/hooks/useContactSearch";
import ChatAddContactDialog from "~/components/Chat/ChatAddContactDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { X } from "lucide-react";
import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/database.types";
import type { User, Contact, Workspace } from "~/lib/types";
import { sendMessage } from "./api.chat_sms";

// Define WorkspaceNumber interface here to avoid type conflicts
interface WorkspaceNumber {
  id: string;
  phone_number: string;
}

type WorkspaceContextType = {
  supabase: SupabaseClient<Database>;
  workspace: {
    id: string;
    name: string;
    owner: string | null;
    users: string[] | null;
    workspace_number?: WorkspaceNumber[];
    created_at: string;
  };
};

type LoaderData = {
  campaigns: any[];
  initialChats: ConversationSummary[];
  hasMoreChats: boolean;
  potentialContacts: Contact[];
  contact: Contact | null;
  error: string | null;
  userRole: string;
  contact_number: string | undefined;
  workspaceNumbers: WorkspaceNumber[];
};

type ImageFetcherData = {
  success: boolean;
  url: string;
  error?: string;
};

type ConversationSummary = NonNullable<Database["public"]["Functions"]["get_conversation_summary"]["Returns"][number]>;

type Chat = {
  contact_phone: string;
  user_phone: string;
  conversation_start: string;
  conversation_last_update: string;
  message_count: number;
  unread_count: number;
};

const phoneRegex = /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;
const CONVERSATION_PAGE_SIZE = 50;

// Custom hook for image handling
function useImageHandling(workspace_id: string) {
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const imageFetcher = useFetcher({ key: "images" });

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const data = new FormData();
        data.append("workspaceId", workspace_id);
        data.append("image", file);
        data.append("fileName", file.name);
        imageFetcher.submit(data, {
          action: "/api/message_media",
          method: "POST",
          encType: "multipart/form-data",
        });
      }
    },
    [workspace_id, imageFetcher]
  );

  const handleImageRemove = useCallback((imageUrl: string) => {
    setSelectedImages((prevImages) =>
      prevImages.filter((image) => image !== imageUrl)
    );
  }, []);

  // Process uploaded images
  useEffect(() => {
    if (imageFetcher.state === "idle" && imageFetcher.data) {
      const fetcherData = imageFetcher.data as ImageFetcherData;
      if (fetcherData.success && fetcherData.url) {
        setSelectedImages((prevImages) => {
          const newImagesSet = new Set([...prevImages, fetcherData.url]);
          return Array.from(newImagesSet);
        });

        const fileInput = document.querySelector<HTMLInputElement>("#image");
        if (fileInput) fileInput.value = "";
      } else if (fetcherData.error) {
        console.error("Image upload error:", fetcherData.error);
      }
    }
  }, [imageFetcher]);

  return {
    selectedImages,
    setSelectedImages,
    handleImageSelect,
    handleImageRemove,
    imageFetcher
  };
}

// Custom hook for date formatting
function useDateFormatter() {
  return useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString([], { 
        month: "short", 
        day: "numeric" 
      });
    }
  }, []);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  const { id: workspaceId } = params;
  const url = new URL(request.url);
  const contact_id = url.searchParams.get("contact_id");
  const campaign_id = url.searchParams.get("campaign_id");
  const hasInboundOnly = url.searchParams.get("has_inbound") === "true";
  const page = Number(url.searchParams.get("page") || "1");
  const conversationsOnly = url.searchParams.get("conversations_only") === "true";
  const contact_number = params.contact_number;

  if (!workspaceId) {
    throw redirect("/workspaces");
  }
  const userRole = await getUserRole({ supabaseClient: supabaseClient as SupabaseClient, user: user as unknown as User, workspaceId: workspaceId as string });

  if (!userRole) {
    return json(
      {
        error: "You don't have access to this workspace",
      },
      { headers, status: 403 },
    );
  }

  if (conversationsOnly) {
    const conversationsPage = await fetchConversationSummary(
      supabaseClient,
      workspaceId,
      {
        campaignId: campaign_id,
        hasInboundOnly,
        page,
        pageSize: CONVERSATION_PAGE_SIZE,
      },
    );

    return json(conversationsPage, { headers });
  }

  const [workspaceNumbers, contactData, smsCampaigns, initialChatsPage] = await Promise.all([
    supabaseClient.from("workspace_number").select("*").eq("workspace", workspaceId).eq('type', 'rented'),
    !contact_id || !contact_number ? null : fetchContactData(supabaseClient, workspaceId, contact_id, contact_number),
    fetchCampaignsByType({
      supabaseClient,
      workspaceId,
      type: "message_campaign",
    }),
    fetchConversationSummary(supabaseClient, workspaceId, {
      campaignId: campaign_id,
      hasInboundOnly,
      page: 1,
      pageSize: CONVERSATION_PAGE_SIZE,
    }),
  ]);
  const { contact, potentialContacts, contactError } = contactData || { contact: null, potentialContacts: [], contactError: null };
  if (contactError) {
    return json(
      {
        error: contactError.message,
        userRole,
      },
      { headers },
    );
  }

  return json(
    {
      campaigns: smsCampaigns,
      workspaceNumbers: workspaceNumbers?.data,
      initialChats: initialChatsPage.chats,
      hasMoreChats: initialChatsPage.hasMore,
      potentialContacts,
      contact,
      error: null,
      userRole,
      contact_number,
    },
    { headers },
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient } = await verifyAuth(request);

  const workspaceId = params.id;
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const contact_number = normalizePhoneNumber(
    params.contact_number || data.contact_number as string,
  );

  const responseData = await sendMessage({
    body: data.body as string,
    to: contact_number as string,
    from: data.from as string,
    media: data.media as string,
    supabase: supabaseClient,
    workspace: workspaceId as string,
    contact_id: data.contact_id as string,
  });
  if (!params.contact_number) return redirect(contact_number);
  return json({ responseData });
}

export default function ChatsList() {
  const { supabase, workspace } = useOutletContext<WorkspaceContextType>();
  const {
    initialChats,
    hasMoreChats: initialHasMoreChats,
    potentialContacts,
    contact,
    campaigns,
    workspaceNumbers,
  } = useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const messageFetcher = useFetcher({ key: "messages" });
  const conversationsFetcher = useFetcher<ConversationSummaryPage>();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const currentPageRef = useRef(1);
  const requestedPageRef = useRef(1);
  const [dialogContact, setDialog] = useState<Contact | null>(null);
  const [hasMoreChats, setHasMoreChats] = useState(initialHasMoreChats);
  const outlet = useOutlet();
  const loc = useLocation();
  const navigate = useNavigate();
  const contact_number = outlet ? loc.pathname.split("/").pop() || "" : "";
  const formatDate = useDateFormatter();
  const selectedCampaignId = searchParams.get("campaign_id");
  const hasInboundOnly = searchParams.get("has_inbound") === "true";

  const { conversations, setConversations, markConversationAsRead } = useConversationSummaryRealTime({
    supabase,
    initial: initialChats,
    workspace: workspace.id,
    activeContactNumber: contact_number,
    campaignId: selectedCampaignId,
    hasInboundOnly,
  });

  // Custom hooks for images
  const { 
    selectedImages, 
    setSelectedImages, 
    handleImageSelect, 
    handleImageRemove 
  } = useImageHandling(workspace.id);

  // Contact search hook with consolidated functionality
  const {
    selectedContact,
    isContactMenuOpen,
    searchError,
    contacts,
    phoneNumber,
    existingConversation,
    handleSearch: handlePhoneChange,
    toggleContactMenu,
    isValid,
  } = useContactSearch({
    supabase,
    workspace_id: workspace.id,
    contact_number,
    potentialContacts,
    dropdownRef,
    initialContact: contact,
  });

  // Navigate away if phone number is invalid
  useEffect(() => {
    if (contact_number && !phoneRegex.test(contact_number)) {
      navigate(".");
    }
  }, [contact_number, navigate]);

  // Form submission handler
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!phoneNumber || messageFetcher.state !== "idle") return;
      
      const formData = new FormData(e.currentTarget);
      formData.append("media", JSON.stringify(selectedImages));
      
      messageFetcher.submit(formData, { method: "POST" });
      
      // Reset form after submission
      const messageBody = e.currentTarget.querySelector<HTMLInputElement>("#body");
      if (messageBody) messageBody.value = "";
      setSelectedImages([]);
    },
    [phoneNumber, messageFetcher, selectedImages, setSelectedImages]
  );

  // Enhanced contact selection handler with read status update
  const handleContactSelect = useCallback(
    (contact: Contact) => {
      const number = normalizePhoneNumber(contact.phone || "");
      if (number) {
        navigate(`./${number}`);
        markConversationAsRead(number);
      }
      return null;
    },
    [markConversationAsRead, navigate]
  );

  const handleExistingConversationClick = useCallback(
    (phoneNumber: string) => {
      navigate(`./${phoneNumber}`);
      markConversationAsRead(phoneNumber);
    },
    [markConversationAsRead, navigate]
  );

  // Adapter functions to match ChatHeader's expected types
  const handlePhoneChangeAdapter = useCallback(
    (value: string | null) => {
      if (value !== null && typeof handlePhoneChange === 'function') {
        // Create a synthetic event to match the handler's expectations
        const syntheticEvent = {
          target: { value }
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        handlePhoneChange(syntheticEvent);
      }
      return null;
    },
    [handlePhoneChange]
  );

  const toggleContactMenuAdapter = useCallback(() => {
    toggleContactMenu();
    return null;
  }, [toggleContactMenu]);

  const handleContactSelectAdapter = useCallback((contact: Contact) => {
    handleContactSelect(contact);
    return null;
  }, [handleContactSelect]);

  const handleExistingConversationClickAdapter = useCallback((phoneNumber: string) => {
    handleExistingConversationClick(phoneNumber);
    return null;
  }, [handleExistingConversationClick]);

  const setDialogAdapter = useCallback((contact: Contact) => {
    setDialog(contact);
    return null;
  }, [setDialog]);

  useEffect(() => {
    const handleMessageRead = (event: CustomEvent) => {
      const contactNumber = event.detail?.contactNumber;
      if (!contactNumber) {
        return;
      }

      setConversations((prevConversations) =>
        prevConversations.map((conversation) =>
          phoneNumbersMatch(conversation.contact_phone, contactNumber)
            ? { ...conversation, unread_count: 0 }
            : conversation,
        ),
      );
    };

    window.addEventListener('message-read', handleMessageRead as EventListener);
    window.addEventListener('messages-read', handleMessageRead as EventListener);

    return () => {
      window.removeEventListener('message-read', handleMessageRead as EventListener);
      window.removeEventListener('messages-read', handleMessageRead as EventListener);
    };
  }, [setConversations]);

  useEffect(() => {
    currentPageRef.current = 1;
    requestedPageRef.current = 1;
    setHasMoreChats(initialHasMoreChats);
  }, [initialChats, initialHasMoreChats, selectedCampaignId, hasInboundOnly]);

  useEffect(() => {
    if (conversationsFetcher.state !== "idle" || !conversationsFetcher.data) {
      return;
    }

    const fetchedPage = conversationsFetcher.data;
    currentPageRef.current = requestedPageRef.current;
    setHasMoreChats(fetchedPage.hasMore);
    setConversations((prevConversations) => {
      const mergedConversations = [...prevConversations];

      for (const chat of fetchedPage.chats) {
        const existingConversationIndex = mergedConversations.findIndex(
          (existingChat) =>
            phoneNumbersMatch(existingChat.contact_phone, chat.contact_phone),
        );

        if (existingConversationIndex >= 0) {
          mergedConversations[existingConversationIndex] = {
            ...mergedConversations[existingConversationIndex],
            ...chat,
          };
          continue;
        }

        mergedConversations.push(chat);
      }

      return mergedConversations.sort((a, b) => {
        return (
          new Date(b.conversation_last_update).getTime() -
          new Date(a.conversation_last_update).getTime()
        );
      });
    });
  }, [conversationsFetcher.data, conversationsFetcher.state, setConversations]);

  const loadMoreConversations = useCallback(() => {
    if (conversationsFetcher.state !== "idle" || !hasMoreChats) {
      return;
    }

    const nextPage = currentPageRef.current + 1;
    requestedPageRef.current = nextPage;

    const params = new URLSearchParams();
    if (selectedCampaignId) {
      params.set("campaign_id", selectedCampaignId);
    }
    if (hasInboundOnly) {
      params.set("has_inbound", "true");
    }
    params.set("conversations_only", "true");
    params.set("page", String(nextPage));
    params.set("page_size", String(CONVERSATION_PAGE_SIZE));

    conversationsFetcher.load(
      `/workspaces/${workspace.id}/chats?${params.toString()}`,
    );
  }, [
    conversationsFetcher,
    hasInboundOnly,
    hasMoreChats,
    selectedCampaignId,
    workspace.id,
  ]);

  useEffect(() => {
    if (!conversationListRef.current || !loadMoreRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreConversations();
        }
      },
      {
        root: conversationListRef.current,
        rootMargin: "200px 0px",
      },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [loadMoreConversations]);

  const displayChats = useMemo(() => {
    return conversations.filter((chat): chat is ConversationSummary =>
      Boolean(chat?.contact_phone),
    );
  }, [conversations]);

  const updateSearchParams = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        updater(next);
        return next;
      });
    },
    [setSearchParams],
  );

  return (
    <main className="flex h-[calc(100vh-80px)] w-full gap-4">
      <Card className="flex h-full w-full flex-col overflow-hidden sm:w-64">
        <Button
          className="flex items-center justify-center rounded-none bg-primary p-4 text-lg text-white hover:bg-primary/90"
          asChild
        >
          <NavLink to=".">
            New Chat
            <MdAdd size={24} className="mr-2" />
          </NavLink>
        </Button>
        <div className="flex">
          <Select
            value={selectedCampaignId || "all"}
            onValueChange={(val) => {
              updateSearchParams((params) => {
                if (val === "all") {
                  params.delete("campaign_id");
                  return;
                }
                params.set("campaign_id", val);
              });
            }}
          >
            <SelectTrigger className="flex items-center p-2">
              <SelectValue placeholder="Filter by Campaign" />
            </SelectTrigger>
            <SelectContent className="w-full bg-slate-50">
              <SelectItem value="all" className="w-full p-4">
                All Campaigns
              </SelectItem>
              {campaigns &&
                campaigns?.map((campaign: { id: number; title: string }) => (
                  <SelectItem
                    value={`${campaign.id}`}
                    key={campaign?.id}
                    className="w-full p-4"
                  >
                    {campaign.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select
            value={hasInboundOnly ? "has_inbound" : "all"}
            onValueChange={(val) => {
              updateSearchParams((params) => {
                if (val === "has_inbound") {
                  params.set("has_inbound", "true");
                  return;
                }
                params.delete("has_inbound");
              });
            }}
          >
            <SelectTrigger className="flex items-center p-2">
              <SelectValue placeholder="Conversation Filter" />
            </SelectTrigger>
            <SelectContent className="w-full bg-slate-50">
              <SelectItem value="all" className="w-full p-4">
                All Conversations
              </SelectItem>
              <SelectItem value="has_inbound" className="w-full p-4">
                Has Inbound Message
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="reset"
            variant={"ghost"}
            onClick={() => {
              updateSearchParams((params) => {
                params.delete("campaign_id");
                params.delete("has_inbound");
              });
            }}
          >
            <X />
          </Button>
        </div>
        <div ref={conversationListRef} className="flex-1 overflow-y-auto">
          {!displayChats.length ? (
            <div className="p-4 text-center text-gray-500">No conversations yet</div>
          ) : (
            <>
              {displayChats.map((chat) => (
                <div
                  key={chat.contact_phone}
                  className={`flex cursor-pointer items-center justify-between border-b border-gray-100 p-4 hover:bg-gray-50 ${
                    chat.contact_phone === contact_number ? "bg-gray-50" : ""
                  }`}
                  onClick={() => handleExistingConversationClick(chat.contact_phone)}
                >
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-500">
                      <MdChat size={20} />
                    </div>
                    <div className="ml-4">
                      <div className="font-medium">
                        {chat.contact_firstname || chat.contact_surname
                          ? `${chat.contact_firstname || ""} ${
                              chat.contact_surname || ""
                            }`
                          : chat.contact_phone}
                      </div>
                      <div className="text-sm text-gray-500 line-clamp-1">
                        {chat.contact_phone} • {chat.message_count} {chat.message_count === 1 ? 'message' : 'messages'}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-xs text-gray-500">
                      {formatDate(chat.conversation_last_update)}
                    </div>
                    {chat.unread_count > 0 && (
                      <div className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
                        {chat.unread_count}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={loadMoreRef} className="p-4 text-center text-sm text-gray-500">
                {conversationsFetcher.state !== "idle"
                  ? "Loading more conversations..."
                  : hasMoreChats
                    ? "Scroll to load more"
                    : "All conversations loaded"}
              </div>
            </>
          )}
        </div>
      </Card>

      <Card className="flex h-full w-full flex-1 flex-col justify-stretch rounded-sm">
        <ChatHeader
          contact={contact}
          outlet={Boolean(outlet)}
          potentialContacts={potentialContacts}
          phoneNumber={phoneNumber}
          contactNumber={contact_number}
          handlePhoneChange={handlePhoneChangeAdapter}
          isValid={isValid}
          selectedContact={selectedContact}
          contacts={contacts}
          toggleContactMenu={toggleContactMenuAdapter}
          isContactMenuOpen={isContactMenuOpen}
          handleContactSelect={handleContactSelectAdapter}
          dropdownRef={dropdownRef}
          searchError={searchError || undefined}
          existingConversation={existingConversation as unknown as Chat}
          handleExistingConversationClick={handleExistingConversationClickAdapter}
          setDialog={setDialogAdapter}
        />
        <div className="flex h-[calc(100vh-250px)] flex-col overflow-y-auto bg-gray-100 dark:bg-zinc-900">
          <Outlet context={{ supabase, workspace, workspaceNumbers }} />
        </div>
        <ChatInput
          isValid={isValid}
          phoneNumber={phoneNumber}
          workspace={workspace as NonNullable<Workspace>}
          workspaceNumbers={workspaceNumbers as WorkspaceNumber[]}
          initialFrom={workspaceNumbers?.[0]?.phone_number as string}
          handleSubmit={handleSubmit}
          handleImageSelect={handleImageSelect}
          handleImageRemove={handleImageRemove}
          selectedImages={selectedImages}
          selectedContact={selectedContact}
          messageFetcher={messageFetcher}
        />
      </Card>
      <ChatAddContactDialog
        existingContact={dialogContact}
        isDialogOpen={Boolean(dialogContact?.phone)}
        setDialog={setDialog}
        contact_number={contact_number}
        workspace_id={workspace.id}
      />
    </main>
  );
}

function ErrorBoundary() {
  const error = useAsyncError();
  console.error(error);   
  return <div>Error</div>;
} 