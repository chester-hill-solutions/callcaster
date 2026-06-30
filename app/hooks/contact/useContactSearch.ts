import { MutableRefObject, useEffect, useState, useCallback } from "react";
import { useClickOutside } from "@/hooks/utils/useClickOutside";
import {
  fetchContactsByPhone,
  fetchLatestMessageForPhone,
} from "@/lib/chats/messaging-client";
import { Contact } from "@/lib/types";
import { formatMessageTimestamp } from "@/lib/utils";
import { isValidPhoneNumber, normalizePhoneNumber } from "@/lib/phone";
import { logger } from "@/lib/logger.client";

interface UseContactSearchProps {
  workspace_id: string;
  contact_number: string;
  potentialContacts: Contact[];
  dropdownRef: MutableRefObject<HTMLElement | null>;
  initialContact: Contact | null;
}

interface ExistingConversation {
  phoneNumber: string;
  latestMessage: string;
  date: string;
}

/**
 * Hook for searching and managing contacts by phone number
 */
export function useContactSearch({
  workspace_id,
  contact_number,
  potentialContacts,
  dropdownRef,
  initialContact,
}: UseContactSearchProps) {
  const [isValid, setIsValid] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(contact_number);
  const [manualContact, setManualContact] = useState<Contact | null>(null);
  const selectedContact = manualContact ?? initialContact;
  const [isContactMenuOpen, setIsContactMenuOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>(potentialContacts || []);
  const [existingConversation, setExistingConversation] = useState<ExistingConversation | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhoneNumber(value);
    setIsValid(isValidPhoneNumber(value));
    setManualContact(null);
    setExistingConversation(null);
  }, []);

  const handleContactSelect = useCallback((contact: Contact) => {
    setManualContact(contact);
    setIsContactMenuOpen(false);
  }, []);

  const toggleContactMenu = useCallback(() => {
    setIsContactMenuOpen((prev) => !prev);
  }, []);

  const clearSelectedContact = useCallback(() => {
    setManualContact(null);
  }, []);

  const searchContact = useCallback(async (nextPhoneNumber: string) => {
    setIsSearching(true);
    setSearchError(null);
    try {
      const data = await fetchContactsByPhone(workspace_id, nextPhoneNumber);

      if (data.length > 0) {
        setContacts(data);
        setManualContact(null);
        setIsContactMenuOpen(true);
        setSearchError(null);
      } else {
        setContacts([]);
        setManualContact(null);
        setSearchError("No contact found. A new contact will be created.");
      }
    } catch (error) {
      logger.error("Contact search error:", error);
      setContacts([]);
      setManualContact(null);
      const errorMessage = error instanceof Error
        ? `Error searching for contact: ${error.message}`
        : "Unable to search for contact. Please try again.";
      setSearchError(errorMessage);
    } finally {
      setIsSearching(false);
    }
  }, [workspace_id]);

  const searchConversation = useCallback(async (nextPhoneNumber: string) => {
    try {
      const normalizedPhoneNumber = normalizePhoneNumber(nextPhoneNumber);
      const latestMessage = await fetchLatestMessageForPhone(
        workspace_id,
        normalizedPhoneNumber,
      );

      if (latestMessage?.body && latestMessage.date_created) {
        setExistingConversation({
          phoneNumber: normalizedPhoneNumber,
          latestMessage: latestMessage.body,
          date: formatMessageTimestamp(latestMessage.date_created),
        });
      } else {
        setExistingConversation(null);
      }
    } catch (error) {
      logger.error("Conversation search error:", error);
      setExistingConversation(null);
    }
  }, [workspace_id]);

  useEffect(() => {
    if (isValid && phoneNumber) {
      searchContact(phoneNumber);
      searchConversation(phoneNumber);
    } else {
      setContacts([]);
      setManualContact(null);
      setSearchError(null);
      setExistingConversation(null);
    }
  }, [phoneNumber, isValid, searchContact, searchConversation]);

  useClickOutside(dropdownRef, () => setIsContactMenuOpen(false));

  return {
    selectedContact,
    isContactMenuOpen,
    searchError,
    contacts,
    isValid,
    phoneNumber,
    existingConversation,
    isSearching,
    setPhoneNumber,
    handleSearch,
    handleContactSelect,
    toggleContactMenu,
    clearSelectedContact,
  };
}
