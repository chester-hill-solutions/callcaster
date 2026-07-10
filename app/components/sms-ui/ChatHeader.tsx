import React, { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdEdit, MdExpandMore } from "react-icons/md";
import { toast } from "sonner";
import { useFetcher, useMatches, useParams, useRevalidator } from "react-router";
import { Contact } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

type LinkContactFetcherData = {
  linkedCount?: number;
  contactId?: number;
  error?: string;
};

type ContactSearchFetcherData = {
  contacts?: Contact[];
  error?: string;
};

const getSortableName = (contact: Contact) => {
  if (contact.firstname && contact.surname) {
    return `${contact.firstname} ${contact.surname}`;
  } else if (contact.firstname) {
    return contact.firstname;
  } else if (contact.surname) {
    return contact.surname;
  } else {
    return contact.phone || "";
  }
};
const getDisplayName = (contact: Contact) => {
  if (contact.firstname && contact.surname) {
    return `${contact.firstname} ${contact.surname}`;
  } else if (contact.firstname) {
    return contact.firstname;
  } else if (contact.surname) {
    return contact.surname;
  } else {
    return contact.phone || "Unknown";
  }
};

type Chat = {
  contact_phone: string;
  user_phone: string;
  conversation_start: string;
  conversation_last_update: string;
  message_count: number;
  unread_count: number;
  phoneNumber?: string;
  latestMessage?: {
    date: string;
  };
};

interface ChatHeaderParams {
  contact?: Contact | null;
  outlet: boolean;
  phoneNumber?: string;
  handlePhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isValid: boolean;
  selectedContact?: Contact | null;
  contacts: Contact[];
  toggleContactMenu: () => void;
  isContactMenuOpen: boolean;
  handleContactSelect: (contact: Contact) => void;
  dropdownRef: RefObject<HTMLDivElement | null>;
  searchError?: string;
  existingConversation?:
    | (Chat & { phoneNumber?: string; latestMessage?: string; date?: string })
    | null;
  handleExistingConversationClick: (phoneNumber: string) => void;
  potentialContacts: Contact[];
  contactNumber?: string;
  setDialog: (contact: Partial<Contact>) => void;
  onShowConversationList?: () => void;
}

export default function ChatHeader({
  contact,
  outlet,
  phoneNumber,
  handlePhoneChange,
  isValid,
  selectedContact,
  contacts,
  toggleContactMenu,
  isContactMenuOpen,
  handleContactSelect,
  dropdownRef,
  searchError,
  existingConversation,
  handleExistingConversationClick,
  potentialContacts,
  contactNumber,
  setDialog,
  onShowConversationList,
}: ChatHeaderParams) {
  const [isContactListOpen, setIsContactListOpen] = useState(false);
  const [isContactSearchOpen, setIsContactSearchOpen] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [hasSearchedContacts, setHasSearchedContacts] = useState(false);
  const params = useParams();
  const workspaceId = params["id"];
  const matches = useMatches();
  const linkFetcher = useFetcher<LinkContactFetcherData>();
  const contactSearchFetcher = useFetcher<ContactSearchFetcherData>();
  const revalidator = useRevalidator();
  const lastHandledLinkDataRef = useRef<unknown>(null);

  const activeContactLabel = contact
    ? getDisplayName(contact)
    : selectedContact
      ? getDisplayName(selectedContact)
      : contactNumber;

  const isLandlineContact = (contact ?? selectedContact)?.line_type === "landline";

  const allContacts = useMemo(() => {
    const potenialFiltered =
      potentialContacts?.length > 0 ? [...potentialContacts] : [];
    const combinedContacts = [...contacts, ...potenialFiltered];
    const uniqueContacts = Array.from(
      new Map(
        combinedContacts.map((contact) => [contact.id, contact]),
      ).values(),
    );
    return uniqueContacts.sort((a, b) =>
      getSortableName(a).localeCompare(getSortableName(b)),
    );
  }, [contacts, potentialContacts]);

  // Conversation may span multiple matched routes (parent chats route +
  // child $contact_number route); walk from the deepest match to find the
  // one that reports whether this conversation has used more than one of
  // the workspace's numbers (see $contact_number.loader.server.ts).
  const multipleNumbersUsed = useMemo(() => {
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const matchData = matches[i]?.data;
      if (
        matchData &&
        typeof matchData === "object" &&
        "multipleNumbersUsed" in matchData
      ) {
        return Boolean(
          (matchData as { multipleNumbersUsed?: boolean }).multipleNumbersUsed,
        );
      }
    }
    return false;
  }, [matches]);

  const isLinking = linkFetcher.state !== "idle";

  const handleLinkContact = useCallback(
    (contactItem: Contact) => {
      if (!contactItem?.id || isLinking) return;
      linkFetcher.submit(
        { intent: "link_contact", contact_id: String(contactItem.id) },
        { method: "post" },
      );
    },
    [isLinking, linkFetcher],
  );

  useEffect(() => {
    if (linkFetcher.state !== "idle" || !linkFetcher.data) return;
    if (lastHandledLinkDataRef.current === linkFetcher.data) return;
    lastHandledLinkDataRef.current = linkFetcher.data;

    if (linkFetcher.data.error) {
      toast.error(linkFetcher.data.error);
      return;
    }

    const linkedCount = linkFetcher.data.linkedCount ?? 0;
    toast.success(
      linkedCount > 0
        ? `Linked — ${linkedCount} earlier message${linkedCount === 1 ? "" : "s"} attached`
        : "Contact linked to this conversation",
    );
    setIsContactListOpen(false);
    setIsContactSearchOpen(false);
    setContactSearchQuery("");
    setHasSearchedContacts(false);
    revalidator.revalidate();
  }, [linkFetcher.state, linkFetcher.data, revalidator]);

  const runContactSearch = useCallback(() => {
    const query = contactSearchQuery.trim();
    if (!query || !workspaceId) return;
    setHasSearchedContacts(true);
    contactSearchFetcher.load(
      `/api/contacts?q=${encodeURIComponent(query)}&workspace_id=${encodeURIComponent(workspaceId)}`,
    );
  }, [contactSearchFetcher, contactSearchQuery, workspaceId]);

  const contactSearchResults = contactSearchFetcher.data?.contacts ?? [];

  const actionButton =
    !!outlet && !contact ? (
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {allContacts.length > 0 && (
            <DropdownMenu
              open={isContactListOpen}
              onOpenChange={setIsContactListOpen}
            >
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="gap-2">
                  Assign Contact
                  <MdExpandMore className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {allContacts.map((contactItem) => (
                  <DropdownMenuItem
                    key={contactItem.id || contactItem.phone}
                    className="flex items-center justify-between gap-3"
                    disabled={isLinking}
                    onSelect={() => handleLinkContact(contactItem)}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {getDisplayName(contactItem)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {contactItem.phone}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Edit ${getDisplayName(contactItem)}`}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        setDialog(contactItem);
                      }}
                    >
                      <MdEdit className="h-4 w-4" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsContactSearchOpen((open) => !open)}
          >
            Find contact
          </Button>
          <Button
            type="button"
            onClick={() =>
              setDialog({
                phone: contactNumber || "",
                firstname: "",
                surname: "",
              } as Contact)
            }
          >
            {contactNumber ? `Add ${contactNumber}` : "Add Contact"}
          </Button>
        </div>
        {isContactSearchOpen && (
          <div className="z-10 w-full max-w-xs rounded-md border border-border bg-background p-2 shadow-lg sm:w-72">
            <div className="flex gap-2">
              <Input
                value={contactSearchQuery}
                onChange={(event) => setContactSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runContactSearch();
                  }
                }}
                placeholder="Search contacts by name or phone"
                className="h-8"
              />
              <Button
                type="button"
                size="sm"
                onClick={runContactSearch}
                disabled={!contactSearchQuery.trim()}
              >
                Search
              </Button>
            </div>
            <div className="mt-2 max-h-48 overflow-auto">
              {contactSearchFetcher.state !== "idle" && (
                <p className="p-2 text-xs text-muted-foreground">
                  Searching…
                </p>
              )}
              {contactSearchFetcher.state === "idle" &&
                hasSearchedContacts &&
                contactSearchResults.length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">
                    No contacts found.
                  </p>
                )}
              {contactSearchResults.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {getDisplayName(result)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {result.phone}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isLinking}
                    onClick={() => handleLinkContact(result)}
                  >
                    Link
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : (
      <Button
        type="button"
        onClick={() =>
          setDialog(
            contact
              ? contact
              : ({
                  phone: phoneNumber || "",
                  firstname: "",
                  surname: "",
                } as Contact),
          )
        }
      >
        {contact
          ? "Edit Contact"
          : phoneNumber
            ? `Add ${phoneNumber}`
            : "Add Contact"}
      </Button>
    );

  return (
    <div className="sticky top-0 z-10 border-b border-border/70 bg-background/95 p-3 backdrop-blur sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {onShowConversationList ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={onShowConversationList}
              >
                {outlet ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <Menu className="h-4 w-4" />
                )}
                <span>Chats</span>
              </Button>
            ) : null}
            <h2 className="truncate text-lg font-semibold sm:text-xl">
              Chat {!!outlet && `with ${activeContactLabel}`}
            </h2>
            {!!outlet && isLandlineContact && (
              <Badge
                variant="secondary"
                className="shrink-0 text-muted-foreground"
              >
                Landline
              </Badge>
            )}
          </div>
          <div className="shrink-0">{actionButton}</div>
        </div>

        {!!outlet && multipleNumbersUsed && (
          <p className="text-xs text-muted-foreground">
            This conversation has used multiple of your numbers.
          </p>
        )}

        {!outlet && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="relative flex-1">
              <Input
                type="tel"
                id="phone"
                name="phone"
                value={phoneNumber}
                onChange={handlePhoneChange}
                required
                className={`mt-1 ${
                  isValid ? "border-input" : "border-red-500"
                } bg-background text-foreground shadow-sm focus:border-ring focus:ring focus:ring-ring/30`}
                placeholder="Enter phone number"
              />
              {!isValid && phoneNumber && phoneNumber.length > 9 && (
                <p className="absolute mt-1 text-sm text-red-500">
                  Please enter a valid phone number
                </p>
              )}
              {searchError && phoneNumber && (
                <p className="absolute mt-1 text-sm text-red-500">
                  {searchError}
                </p>
              )}
            </div>

            {existingConversation && (
              <div className="z-10 rounded-md border border-border bg-background shadow-lg focus:outline-none sm:mt-2 sm:w-56">
                <button
                  type="button"
                  onClick={() =>
                    handleExistingConversationClick(
                      existingConversation.phoneNumber ||
                        existingConversation.contact_phone,
                    )
                  }
                  className="ml-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  View Existing Conversation
                </button>
                <div className="mt-2 rounded-md bg-muted p-2 text-sm">
                  <p>
                    <strong>Latest message:</strong>{" "}
                    {existingConversation.latestMessage?.date || "No messages"}
                  </p>
                  <p>
                    <strong>Date:</strong>{" "}
                    {existingConversation.conversation_last_update}
                  </p>
                </div>
              </div>
            )}
            {!existingConversation && allContacts.length > 0 && (
              <div
                className="relative inline-block w-full text-left sm:w-auto"
                ref={dropdownRef as React.RefObject<HTMLDivElement>}
              >
                <button
                  type="button"
                  className="inline-flex w-full justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:w-auto"
                  onClick={toggleContactMenu}
                >
                  {selectedContact
                    ? `${selectedContact.firstname} ${selectedContact.surname}`
                    : "Select Contact"}
                  <MdExpandMore
                    className="-mr-1 ml-2 h-5 w-5"
                    aria-hidden="true"
                  />
                </button>
                {isContactMenuOpen && (
                  <div className="absolute right-0 z-10 mt-2 max-h-60 w-full origin-top-right overflow-auto rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-zinc-800 sm:w-56">
                    <div
                      className="py-1"
                      role="menu"
                      aria-orientation="vertical"
                      aria-labelledby="options-menu"
                    >
                      {allContacts.map((contact) => (
                        <button
                          key={contact.id}
                          className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                          onClick={() => handleContactSelect(contact)}
                        >
                          {contact.firstname} {contact.surname} -{" "}
                          {contact.phone}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
