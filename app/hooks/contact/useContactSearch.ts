import { MutableRefObject, useEffect, useState, useCallback, useRef } from "react";
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
  const requestSequenceRef = useRef(0);

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

  const searchContact = useCallback(async (nextPhoneNumber: string, sequence: number) => {
    // Ignore result if a newer search sequence has started
    if (sequence !== requestSequenceRef.current) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const data = await fetchContactsByPhone(workspace_id, nextPhoneNumber);

      // Check sequence again before updating state; abort if stale
      if (sequence !== requestSequenceRef.current) return;

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
      // Check sequence before updating error state
      if (sequence !== requestSequenceRef.current) return;

      logger.error("Contact search error:", error);
      setContacts([]);
      setManualContact(null);
      const errorMessage = error instanceof Error
        ? `Error searching for contact: ${error.message}`
        : "Unable to search for contact. Please try again.";
      setSearchError(errorMessage);
    } finally {
      // Check sequence before clearing searching state
      if (sequence === requestSequenceRef.current) {
        setIsSearching(false);
      }
    }
  }, [workspace_id]);

  const searchConversation = useCallback(async (nextPhoneNumber: string, sequence: number) => {
    // Ignore result if a newer search sequence has started
    if (sequence !== requestSequenceRef.current) return;

    try {
      const normalizedPhoneNumber = normalizePhoneNumber(nextPhoneNumber);
      const latestMessage = await fetchLatestMessageForPhone(
        workspace_id,
        normalizedPhoneNumber,
      );

      // Check sequence again before updating state; abort if stale
      if (sequence !== requestSequenceRef.current) return;

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
      // Check sequence before updating error state
      if (sequence !== requestSequenceRef.current) return;

      logger.error("Conversation search error:", error);
      setExistingConversation(null);
    }
  }, [workspace_id]);

  /**
   * @effect Debounced fetch of contact matches and latest conversation for the typed phone number.
   *   Uses a request-sequence guard (requestSequenceRef) to ignore stale responses from
   *   out-of-order network requests; a pending timer is canceled on unmount or input change.
   * @effect-deps phoneNumber, isValid (only searches once the number is valid), searchContact, searchConversation
   * @effect-side-effects fetch via debounce cleanup (fetchContactsByPhone + fetchLatestMessageForPhone)
   * @effect-why-not-loader This is disguised data fetching driven by local input state rather than
   *   route params — it calls imperative HTTP helpers directly instead of a loader/useFetcher. Could
   *   be migrated to a debounced useFetcher().load() pair (workspace_id + phoneNumber as query params)
   *   so React Router owns request de-duplication/cancellation instead of this hook doing it by hand.
   */
  useEffect(() => {
    if (!isValid || !phoneNumber) {
      setContacts([]);
      setManualContact(null);
      setSearchError(null);
      setExistingConversation(null);
      return;
    }

    // Increment sequence number for this search cycle
    const currentSequence = ++requestSequenceRef.current;

    // Debounce the search requests (~300ms)
    const timeoutId = setTimeout(() => {
      // Only execute if this sequence is still current (no newer search has fired)
      if (currentSequence === requestSequenceRef.current) {
        searchContact(phoneNumber, currentSequence);
        searchConversation(phoneNumber, currentSequence);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
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
