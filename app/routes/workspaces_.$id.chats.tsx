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
import { MdAdd, MdChat, MdExpandMore } from "react-icons/md";
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
import { useConversationSummaryRealTime } from "~/hooks/useChatRealtime";
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
import type { User, Contact, WorkspaceNumber, Workspace } from "~/lib/types";
import { sendMessage } from "./api.chat_sms";

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
  const imageFetcher = useFetcher({ key: "images" });
  const filterFetcher = useFetcher({ key: "chat-filters" });
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dialogContact, setDialog] = useState<Contact | null>(null);
  const outlet = useOutlet();
  const loc = useLocation();
  const contact_number = outlet ? loc.pathname.split("/").pop() || "" : "";

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

  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const data = new FormData();
        data.append("workspaceId", workspace.id);
        data.append("image", file);
        data.append("fileName", file.name);
        imageFetcher.submit(data, {
          action: "/api/message_media",
          method: "POST",
          encType: "multipart/form-data",
        });
      }
    },
    [workspace.id, imageFetcher],
  );

  const handleImageRemove = useCallback((imageUrl: string) => {
    setSelectedImages((prevImages) =>
      prevImages.filter((image) => image !== imageUrl),
    );
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!phoneNumber || messageFetcher.state !== "idle") return;
      const formData = new FormData(e.currentTarget);
      formData.append("media", JSON.stringify(selectedImages));
      messageFetcher.submit(formData, { method: "POST" });
      const messageBody = e.currentTarget.querySelector<HTMLInputElement>("#body");
      if (messageBody) messageBody.value = "";
      setSelectedImages([]);
    },
    [phoneNumber, messageFetcher, selectedImages],
  );

  const handleContactSelect = useCallback(
    (contact: Contact) => {
      const number = normalizePhoneNumber(contact.phone || "");
      if (number) {
        navigate(`./${number}`);
      }
    },
    [navigate],
  );

  const handleExistingConversationClick = useCallback(
    (phoneNumber: string) => {
      navigate(`./${phoneNumber}`);
    },
    [navigate],
  );

  useEffect(() => {
    if (imageFetcher.state === "idle" && imageFetcher.data) {
      const data = imageFetcher.data as ImageFetcherData;
      if (data.success && data.url) {
        setSelectedImages((prevImages) => {
          const newImagesSet = new Set([...prevImages, data.url]);
          return Array.from(newImagesSet);
        });

        const fileInput = document.querySelector<HTMLInputElement>("#image");
        if (fileInput) fileInput.value = "";
      } else if (data.error) {
        console.error("Image upload error:", data.error);
      }
    }
  }, [imageFetcher]);

  useEffect(() => {
    if (contact_number && !phoneRegex.test(contact_number)) {
      navigate(".");
    }
  }, [contact_number, navigate]);

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  }
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
        <filterFetcher.Form>
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
        </filterFetcher.Form>
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
            <Await resolve={chatsPromise} errorElement={<ErrorBoundary />}>
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

                const { conversations } = useConversationSummaryRealTime({
                  supabase: supabase,
                  initial: shapedChats,
                  workspace: workspace.id,
                });

                if (!conversations?.length) {
                  return <div className="p-4 text-center text-gray-500">No conversations yet</div>;
                }

                return conversations
                  .filter((chat): chat is ConversationSummary => Boolean(chat?.contact_phone))
                  .map((chat) => (
                    <NavLink
                      key={chat.contact_phone}
                      to={chat.contact_phone}
                      className={({ isActive }) => `
                        flex items-center border-b border-gray-200 p-3 transition-colors hover:bg-gray-100 dark:bg-zinc-900
                        ${isActive ? "bg-primary/10 font-semibold" : ""}
                        ${chat.unread_count > 0 ? "border-l-4 border-l-primary" : ""}
                      `}
                    >
                      <MdChat
                        className="mr-3 flex-shrink-0 text-gray-500"
                        size={20}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between">
                          <span className="truncate font-medium">
                            {chat.contact_firstname || chat.contact_surname
                              ? `${chat.contact_firstname || ""} ${chat.contact_surname || ""}`.trim()
                              : chat.contact_phone}
                          </span>
                          <span className="ml-2 flex-shrink-0 text-xs text-gray-500">
                            {formatDate(chat.conversation_last_update)}
                          </span>
                        </div>
                        <p className="truncate text-sm text-gray-600">
                          {chat.contact_phone}
                        </p>
                      </div>
                      {chat.unread_count > 0 && (
                        <span className="ml-2 flex-shrink-0 rounded-full bg-primary px-2 py-1 text-xs font-bold text-white">
                          {chat.unread_count}
                        </span>
                      )}
                    </NavLink>
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
          handlePhoneChange={handlePhoneChange as unknown as (e: string | null) => null}
          isValid={isValid}
          selectedContact={selectedContact}
          contacts={contacts}
          toggleContactMenu={toggleContactMenu as unknown as () => null}
          isContactMenuOpen={isContactMenuOpen}
          handleContactSelect={handleContactSelect as unknown as (e: Contact) => null}
          dropdownRef={dropdownRef}
          searchError={searchError || undefined}
          existingConversation={existingConversation as unknown as Chat}
          handleExistingConversationClick={handleExistingConversationClick as unknown as (phoneNumber: string) => null}
          setDialog={setDialog as unknown as (contact: Contact) => null}
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