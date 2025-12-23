import React, { RefObject, useState } from "react";
import { MdEdit, MdExpandMore } from "react-icons/md";
import { Contact } from "@/lib/types";
import { Button } from "@/components/ui/button";

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
}

<<<<<<< HEAD:app/components/sms-ui/ChatHeader.tsx
interface ChatHeaderParams {
=======
type ChatHeaderParams = {
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/Chat/ChatHeader.tsx
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
<<<<<<< HEAD:app/components/sms-ui/ChatHeader.tsx
  dropdownRef: RefObject<HTMLElement | null>;
  searchError?: string;
  existingConversation?: Chat & { phoneNumber?: string; latestMessage?: string; date?: string } | null;
  handleExistingConversationClick: (phoneNumber: string) => void;
  potentialContacts: Contact[];
  contactNumber?: string;
  setDialog: (contact: Partial<Contact>) => void;
=======
  dropdownRef: RefObject<HTMLDivElement>;
  searchError?: string;
  existingConversation: Chat;
  handleExistingConversationClick: (phoneNumber: string) => void;
  potentialContacts: Contact[];
  contactNumber?: string;
  setDialog: (contact: Contact) => void;
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/Chat/ChatHeader.tsx
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
}:ChatHeaderParams) {
  const [isContactListOpen, setIsContactListOpen] = useState(false);

  const allContacts = React.useMemo(() => {
    const potenialFiltered = potentialContacts?.length > 0 ? [...potentialContacts] : [];
    const combinedContacts = [...contacts, ...(potenialFiltered)];
    const uniqueContacts = Array.from(
      new Map(
        combinedContacts.map((contact) => [contact.id, contact]),
      ).values(),
    );
    return uniqueContacts.sort((a, b) =>
      getSortableName(a).localeCompare(getSortableName(b)),
    );
  }, [contacts, potentialContacts]);

  return (
    <div className="sticky top-0 z-10 flex p-4 shadow">
      <div className="flex flex-auto items-end justify-between gap-2">
        <h2 className="text-xl font-semibold">
          Chat{" "}
          {!!outlet &&
            `with ${contact ? `${contact.firstname} ${contact.surname}` : contactNumber}`}
        </h2>
        {!outlet && (
          <div className="flex flex-auto items-center gap-2">
            <div className="relative flex-auto">
              <input
                type="tel"
                id="phone"
                name="phone"
                value={phoneNumber}
                onChange={handlePhoneChange}
                required
                className={`mt-1 block w-full rounded-md ${
                  isValid ? "border-gray-300" : "border-red-500"
                } shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50`}
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
              <div className="absolute right-0 top-0 z-10 mt-2 w-56 rounded-md bg-white dark:bg-zinc-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <button
                  onClick={() =>
                    handleExistingConversationClick(
                      existingConversation.phoneNumber || existingConversation.contact_phone,
                    )
                  }
                  className="ml-2 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  View Existing Conversation
                </button>
                <div className="mt-2 rounded-md bg-gray-100 dark:bg-zinc-700 p-2 text-sm">
                  <p>
                    <strong>Latest message:</strong>{" "}
                    {existingConversation.latestMessage?.date || "No messages"}
                  </p>
                  <p>
                    <strong>Date:</strong> {existingConversation.conversation_last_update}
                  </p>
                </div>
              </div>
            )}
            {!existingConversation && allContacts.length > 0 && (
              <div
                className="relative inline-block text-left"
                ref={dropdownRef}
              >
                <button
                  type="button"
                  className="inline-flex justify-center rounded-md border border-gray-300 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-100"
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
                  <div className="absolute right-0 z-10 mt-2 max-h-60 w-56 origin-top-right overflow-auto rounded-md bg-white dark:bg-zinc-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
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
        {!!outlet && !contact && allContacts.length > 0 ? (
          <div className="relative inline-block text-left">
            <button
              type="button"
              className="inline-flex justify-center rounded-md border border-gray-300 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-100"
              onClick={() => setIsContactListOpen(!isContactListOpen)}
            >
              Edit Contacts
              <MdExpandMore className="-mr-1 ml-2 h-5 w-5" aria-hidden="true" />
            </button>
            {isContactListOpen && (
              <div className="absolute right-0 z-10 mt-2 w-64 origin-top-right rounded-md bg-white dark:bg-zinc-800 text-gray-300 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <div
                  className="py-1"
                  role="menu"
                  aria-orientation="vertical"
                  aria-labelledby="options-menu"
                >
                  {allContacts.map((contact) => (
                    <div
                      key={contact.id || contact.phone}
                      className="flex items-center justify-between px-4 py-2 hover:bg-gray-100 dark:hover:bg-zinc-900"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-300">
                          {getDisplayName(contact)}
                        </p>
                        <p className="text-sm text-gray-600 ">{contact.phone}</p>
                      </div>
                      <button
                        onClick={() => setDialog(contact)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        <MdEdit className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ):(
          <Button onClick={() => setDialog({phone: phoneNumber || "", firstname: "", surname: ""} as Contact)}>Add {phoneNumber}</Button>
        )}
      </div>
    </div>
  );
}
