import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  redirect,
} from "@remix-run/node";
import {
  NavLink,
  Outlet,
  json,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useOutlet,
  useOutletContext,
  useSearchParams,
} from "@remix-run/react";
import { MdAdd, MdChat, MdExpandMore } from "react-icons/md";
import { Button } from "~/components/ui/button";
import {
  fetchCampaignsByType,
  fetchContactData,
  fetchConversationSummary,
  fetchWorkspaceData,
  getUserRole,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { normalizePhoneNumber } from "~/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
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

const phoneRegex = /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const url = new URL(request.url);
  const contact_id = url.searchParams.get("contact_id");
  const campaign_id = url.searchParams.get("campaign_id");
  const workspaceId = params.id;
  const contact_number = params.contact_number;

  if (!workspaceId) {
    return json({ workspace: null, error: "Workspace does not exist", userRole: null }, { headers });
  }

  const userRole = getUserRole({ serverSession, workspaceId });

  const [workspaceData, chatsData, contactData, smsCampaigns] =
    await Promise.all([
      fetchWorkspaceData(supabaseClient, workspaceId),
      fetchConversationSummary(supabaseClient, workspaceId, campaign_id),
      fetchContactData(supabaseClient, workspaceId, contact_id, contact_number),
      fetchCampaignsByType({
        supabaseClient,
        workspaceId,
        type: "message_campaign",
      }),
    ]);

  const { workspace, workspaceError } = workspaceData;
  const { chats, chatsError } = chatsData;
  const { contact, potentialContacts, contactError } = contactData;
  const chatNumbers = Array.from(
    new Set(
      chats
        ?.filter((i) => Boolean(i.contact_phone))
        .map((chat) => chat.contact_phone),
    ),
  );
  const shapedChats = chatNumbers.map((num) =>
    chats?.find((chat) => chat.contact_phone === num),
  );
  const errors = [workspaceError, chatsError, contactError].filter(Boolean);
  if (errors.length) {
    return json(
      {
        error: errors.map((error) => error.message).join(", "),
        userRole,
      },
      { headers },
    );
  }
  return json(
    {
      campaigns: smsCampaigns,
      chats: shapedChats,
      potentialContacts,
      contact,
      workspace,
      error: null,
      userRole,
      contact_number,
    },
    { headers },
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const contact_number = normalizePhoneNumber(
    params.contact_number || data.contact_number,
  );
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
      media: data.media,
    }),
  });
  const responseData = await res.json();
  if (!params.contact_number) return redirect(contact_number);
  return json({ responseData });
}
export default function ChatsList() {
  const { supabase } = useOutletContext();
  const { chats, workspace, userRole, potentialContacts, contact, campaigns } =
    useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const messageFetcher = useFetcher({ key: "messages" });
  const imageFetcher = useFetcher({ key: "images" });
  const filterFetcher = useFetcher({ key: "chat-filters" });
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const [dialogContact, setDialog] = useState({});
  const outlet = useOutlet();
  const loc = useLocation();
  const contact_number = outlet ? loc.pathname.split("/").pop() : "";

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
    workspace_id: workspace?.id,
    contact_number,
    potentialContacts,
    dropdownRef,
    initialContact: contact,
  });
  const [selectedImages, setSelectedImages] = useState([]);

  const { conversations } = useConversationSummaryRealTime({
    supabase: supabase,
    initial: chats,
    workspace: workspace?.id,
  });

  const handleImageSelect = useCallback(
    (e) => {
      const file = e.target.files[0];
      if (file) {
        const data = new FormData();
        data.append("workspaceId", workspace?.id);
        data.append("image", file);
        data.append("fileName", file.name);
        imageFetcher.submit(data, {
          action: "/api/message_media",
          method: "POST",
          encType: "multipart/form-data",
        });
      }
    },
    [workspace?.id, imageFetcher],
  );

  const handleImageRemove = useCallback((imageUrl) => {
    setSelectedImages((prevImages) =>
      prevImages.filter((image) => image !== imageUrl),
    );
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!phoneNumber || messageFetcher.state !== "idle") return;
      const formData = new FormData(e.target);
      formData.append("media", JSON.stringify(selectedImages));
      messageFetcher.submit(formData, { method: "POST" });
      const messageBody = document.getElementById("body");
      if (messageBody) messageBody.value = "";
      setSelectedImages([]);
    },
    [phoneNumber, messageFetcher, selectedImages],
  );

  const handleContactSelect = useCallback(
    (contact) => {
      const number = normalizePhoneNumber(contact.phone);

      navigate(`./${number}`);
    },
    [navigate],
  );

  const handleExistingConversationClick = useCallback(
    (phoneNumber) => {
      navigate(`./${phoneNumber}`);
    },
    [navigate],
  );

  useEffect(() => {
    if (imageFetcher.state === "idle" && imageFetcher.data) {
      if (imageFetcher.data.success && imageFetcher.data.url) {
        setSelectedImages((prevImages) => {
          const newImagesSet = new Set([...prevImages, imageFetcher.data.url]);
          return Array.from(newImagesSet);
        });

        const fileInput = document.getElementById("image");
        if (fileInput) fileInput.value = "";
      } else if (imageFetcher.data.error) {
        console.error("Image upload error:", imageFetcher.data.error);
      }
    }
  }, [imageFetcher]);

  useEffect(() => {
    !phoneRegex.test(contact_number) && navigate(".");
  }, [contact_number, navigate]);

  function formatDate(dateString) {
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
    <main className="flex h-full max-h-[80vh] w-full gap-4">
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
                  console.log(Object.fromEntries(prev), val);
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
          {conversations?.length > 0 ? (
            conversations
              .filter((i) => Boolean(i.contact_phone))
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
                        {formatDate(new Date(chat.conversation_last_update))}
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
              ))
          ) : (
            <div className="p-4 text-center text-gray-500">
              No conversations yet
            </div>
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
          handlePhoneChange={handlePhoneChange}
          isValid={isValid}
          selectedContact={selectedContact}
          contacts={contacts}
          toggleContactMenu={toggleContactMenu}
          isContactMenuOpen={isContactMenuOpen}
          handleContactSelect={handleContactSelect}
          dropdownRef={dropdownRef}
          searchError={searchError}
          existingConversation={existingConversation}
          handleExistingConversationClick={handleExistingConversationClick}
          setDialog={setDialog}
        />
        <div className="flex h-full flex-col overflow-y-scroll bg-gray-100 dark:bg-zinc-900">
          <Outlet context={{ supabase, workspace }} />
        </div>
        <ChatInput
          isValid={isValid}
          phoneNumber={phoneNumber}
          workspace={workspace}
          initialFrom={workspace?.workspace_number?.[0]}
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
        workspace_id={workspace?.id}
      />
    </main>
  );
}
