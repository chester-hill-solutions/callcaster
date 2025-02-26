import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  defer,
  redirect,
} from "@remix-run/node";
import {
  NavLink,
  Outlet,
  Await,
  json,
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
  fetchCampaignsByType,
  fetchContactData,
  fetchConversationSummary,
  getUserRole,
} from "~/lib/database.server";
import { verifyAuth } from "~/lib/supabase.server";
import { normalizePhoneNumber } from "~/lib/utils";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import type { User, Contact, WorkspaceNumber as WorkspaceNumberType, Workspace } from "~/lib/types";
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
  chatsPromise: Promise<{
    chats: Database["public"]["Functions"]["get_conversation_summary"]["Returns"];
    chatsError: any;
  }>;
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
type ChatsData = {
  chats: ConversationSummary[];
  chatsError: any;
};

type Chat = {
  contact_phone: string;
  user_phone: string;
  conversation_start: string;
  conversation_last_update: string;
  message_count: number;
  unread_count: number;
};

const phoneRegex = /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;

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
  const contact_number = params.contact_number;

  if (!workspaceId) {
    throw redirect("/workspaces");
  }
  const userRole = await getUserRole({ supabaseClient: supabaseClient as SupabaseClient, user: user as unknown as User, workspaceId: workspaceId as string });

  const [workspaceNumbers, contactData, smsCampaigns] = await Promise.all([
    supabaseClient.from("workspace_number").select("*").eq("workspace", workspaceId).eq('type', 'rented'),
    !contact_id || !contact_number ? null : fetchContactData(supabaseClient, workspaceId, contact_id, contact_number),
    fetchCampaignsByType({
      supabaseClient,
      workspaceId,
      type: "message_campaign",
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

  const chatsPromise = fetchConversationSummary(supabaseClient, workspaceId, campaign_id);
  return defer(
    {
      campaigns: smsCampaigns,
      workspaceNumbers: workspaceNumbers?.data,
      chatsPromise,
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
  const { supabaseClient, headers, user } = await verifyAuth(request);

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
  const { chatsPromise, potentialContacts, contact, campaigns, workspaceNumbers } = useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const messageFetcher = useFetcher({ key: "messages" });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dialogContact, setDialog] = useState<Contact | null>(null);
  const outlet = useOutlet();
  const loc = useLocation();
  const navigate = useNavigate();
  const contact_number = outlet ? loc.pathname.split("/").pop() || "" : "";
  const formatDate = useDateFormatter();
  
  // State to hold the conversation data
  const [conversationData, setConversationData] = useState<ConversationSummary[]>([]);

  // Initialize the conversation summary hook with the state
  const { conversations, refreshConversations, markConversationAsRead } = useConversationSummaryRealTime({
    supabase,
    initial: conversationData,
    workspace: workspace.id,
    activeContactNumber: contact_number,
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
    clearSelectedContact,
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
        
        // Mark messages as read when selecting a contact
        if (supabase) {
          supabase
            .from("message")
            .update({ status: "delivered" })
            .eq("workspace", workspace.id)
            .eq("status", "received")
            .or(`from.eq.${number},to.eq.${number}`)
            .then(({ error }) => {
              if (error) {
                console.error("Error marking messages as read:", error);
              } else {
                // Trigger a global event to notify other components
                window.dispatchEvent(new CustomEvent('messages-read', { 
                  detail: { contactNumber: number }
                }));
              }
            });
        }
      }
      return null;
    },
    [navigate, supabase, workspace.id]
  );

  const handleExistingConversationClick = useCallback(
    (phoneNumber: string) => {
      navigate(`./${phoneNumber}`);
      
      // Mark messages as read when selecting a conversation
      if (supabase) {
        supabase
          .from("message")
          .update({ status: "delivered" })
          .eq("workspace", workspace.id)
          .eq("status", "received")
          .or(`from.eq.${phoneNumber},to.eq.${phoneNumber}`)
          .then(({ error }) => {
            if (error) {
              console.error("Error marking messages as read:", error);
            } else {
              // Trigger a global event to notify other components
              window.dispatchEvent(new CustomEvent('messages-read', { 
                detail: { contactNumber: phoneNumber }
              }));
            }
          });
      }
    },
    [navigate, supabase, workspace.id]
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

  // Listen for message-read and messages-read events to refresh the UI
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout | null = null;
    
    const handleMessageRead = (event: CustomEvent) => {
      // Get the contact number from the event detail
      const contactNumber = event.detail?.contactNumber;
      
      // Only update if we have a contact number and it's in our conversation list
      if (contactNumber && conversations.some(conv => 
        phoneNumbersMatch(conv.contact_phone, contactNumber)
      )) {
        // Clear any existing timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        // Set a new timer to refresh after a delay
        debounceTimer = setTimeout(() => {
          // This will update the unread count for the specific conversation
          refreshConversations(false);
        }, 1000);
      }
    };

    // Add event listeners
    window.addEventListener('message-read', handleMessageRead as EventListener);
    window.addEventListener('messages-read', handleMessageRead as EventListener);

    return () => {
      // Remove event listeners and clear any pending timer
      window.removeEventListener('message-read', handleMessageRead as EventListener);
      window.removeEventListener('messages-read', handleMessageRead as EventListener);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [conversations, refreshConversations]);

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
            defaultValue={searchParams.get("campaign_id") || undefined}
            onValueChange={(val) => {
              setSearchParams((prev) => {
                prev.set("campaign_id", val);
                return prev;
              });
            }}
          >
            <SelectTrigger className="flex items-center p-2">
              <SelectValue placeholder="Filter by Campaign" />
            </SelectTrigger>
            <SelectContent className="w-full bg-slate-50">
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
          <Button
            type="reset"
            variant={"ghost"}
            onClick={() =>
              setSearchParams((prev) => {
                prev.delete("campaign_id");
                return prev;
              })
            }
          >
            <X />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={
            <div className="h-[calc(100vh-200px)] animate-pulse space-y-4 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="h-10 w-10 rounded-full bg-gray-200"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-gray-200"></div>
                    <div className="h-3 w-1/2 rounded bg-gray-200"></div>
                  </div>
                </div>
              ))}
            </div>
          }>
            <Await resolve={chatsPromise} errorElement={<p className="p-4 text-center text-red-500">Error loading chats</p>}>
              {(chatsData: any) => {
                const { chats } = chatsData as ChatsData;
                const chatNumbers = Array.from(
                  new Set(
                    chats
                      ?.filter((chat): chat is ConversationSummary => Boolean(chat?.contact_phone))
                      .map((chat) => chat.contact_phone),
                  ),
                );
                const shapedChats = chatNumbers.map((num) =>
                  chats?.find((chat) => chat?.contact_phone === num),
                ).filter((chat): chat is ConversationSummary => chat !== undefined && chat !== null);

                // Update the conversations data state
                useEffect(() => {
                  if (shapedChats?.length > 0) {
                    // Only update if the data has actually changed
                    const currentPhoneNumbers = new Set(conversationData.map(c => c.contact_phone));
                    const newPhoneNumbers = new Set(shapedChats.map(c => c.contact_phone));
                    
                    // Check if the phone numbers have changed
                    const hasNewConversations = shapedChats.some(chat => 
                      !currentPhoneNumbers.has(chat.contact_phone)
                    );
                    
                    // Check if the conversation count has changed
                    const countChanged = currentPhoneNumbers.size !== newPhoneNumbers.size;
                    
                    if (hasNewConversations || countChanged || conversationData.length === 0) {
                      setConversationData(shapedChats);
                      // Only force refresh if we have new data
                      refreshConversations(false);
                    }
                  }
                }, [shapedChats, conversationData, refreshConversations]);

                if (!shapedChats?.length) {
                  return <div className="p-4 text-center text-gray-500">No conversations yet</div>;
                }

                // Use the conversations from the real-time hook instead of shapedChats
                // This ensures we get real-time updates
                const displayChats = conversations.length > 0 ? conversations : shapedChats;

                return displayChats
                  .filter((chat): chat is ConversationSummary => Boolean(chat?.contact_phone))
                  .map((chat) => (
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
                  ));
              }}
            </Await>
          </Suspense>
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