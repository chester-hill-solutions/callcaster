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
import { MdAdd } from "react-icons/md";
import { Button } from "~/components/ui/button";
import {
  fetchContactData,
  fetchConversationSummary,
  fetchWorkspaceData,
  findPotentialContacts,
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

const phoneRegex = /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const url = new URL(request.url);
  const contact_id = url.searchParams.get("contact_id");
  const workspaceId = params.id;
  const contact_number = params.contact_number;

  if (!workspaceId) {
    return json(
      { workspace: null, error: "Workspace does not exist", userRole: null },
      { headers },
    );
  }

  const userRole = getUserRole({ serverSession, workspaceId });

  const [workspaceData, chatsData, contactData] = await Promise.all([
    fetchWorkspaceData(supabaseClient, workspaceId),
    fetchConversationSummary(supabaseClient, workspaceId),
    fetchContactData(supabaseClient, workspaceId, contact_id, contact_number),
  ]);

  const { workspace, workspaceError } = workspaceData;
  const { chats, chatsError } = chatsData;
  const { contact, potentialContacts, contactError } = contactData;

  const errors = [workspaceError, chatsError, contactError].filter(Boolean);
  console.log("Potential Contacts: ", potentialContacts);
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
      chats,
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
  const { chats, workspace, userRole, potentialContacts, contact } =
    useLoaderData();
  const messageFetcher = useFetcher({ key: "messages" });
  const imageFetcher = useFetcher({ key: "images" });
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const [dialogContact, setDialog] = useState(false);
  const outlet = useOutlet();
  const loc = useLocation();
  const contact_number = !!outlet ? loc.pathname.split("/").pop() : '';

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
  const [selectedImages, setSelectedImages] = useState([]);

  const { conversations } = useConversationSummaryRealTime({
    supabase: supabase,
    initial: chats,
    workspace: workspace.id,
  });

  const handleImageSelect = useCallback(
    (e) => {
      const file = e.target.files[0];
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
      /*   setParams((prev) => {
        prev.set("contact_id", contact.id);
        return prev;
      });
      navigate(`./${number}?contact_id=${contact.id}`); */
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
    console.log(contact_number)
    !phoneRegex.test(contact_number) && navigate(".");
  }, [contact_number, navigate]);
  return (
    <main className="mx-auto flex h-full w-[95%] gap-4">
      <Card className="flex h-full flex-col space-y-0 rounded-sm sm:w-[250px]">
        <Button
          className="flex h-fit rounded-none rounded-t-sm text-lg"
          asChild
        >
          <NavLink to={"."}>
            New Chat <MdAdd size={24} />
          </NavLink>
        </Button>
        <div>
          {conversations?.length > 0 &&
            conversations.map((chat, index) => {
              return (
                <Button
                  key={index}
                  asChild
                  className={`flex flex-auto rounded-none bg-transparent text-black hover:text-white ${index + 1 === chats.length && "rounded-b-sm"}`}
                >
                  <NavLink
                    to={chat.contact_phone}
                    className={`relative flex flex-auto border-2 border-t-0 ${chat.unread_count > 0 ? "border-primary" : "border-[#333]"}`}
                  >
                    <div>{chat.contact_phone}</div>
                    {chat.unread_count > 0 && (
                      <div className="absolute right-2">
                        ({chat.unread_count})
                      </div>
                    )}
                  </NavLink>
                </Button>
              );
            })}
        </div>
      </Card>
      <Card className="flex h-full w-full flex-1 flex-col rounded-sm">
        <ChatHeader
          contact={contact}
          outlet={outlet}
          potentialContacts={potentialContacts}
          phoneNumber={phoneNumber}
          contactNumber={contact_number}
          handlePhoneChange={handlePhoneChange}
          isValid={isValid}
          selectedContact={selectedContact}
          clearSelectedContact={clearSelectedContact}
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
        <div className="flex h-full flex-col overflow-y-scroll bg-gray-100">
          <Outlet context={{ supabase, workspace }} />
        </div>
        <ChatInput
          isValid={isValid}
          phoneNumber={phoneNumber}
          workspace={workspace}
          initialFrom={workspace.workspace_number?.[0]}
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
        isDialogOpen={Boolean(dialogContact)}
        setDialog={setDialog}
        contact_number={contact_number}
        workspace_id={workspace.id}
      />
    </main>
  );
}
