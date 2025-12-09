import { SupabaseClient } from "@supabase/supabase-js";
import { MutableRefObject, useEffect, useState, useCallback } from "react";
import { Contact } from "@/lib/types";
import { phoneRegex, normalizePhoneNumber, isValidPhoneNumber } from "@/lib/utils/phone";

interface UseContactSearchProps {
  supabase: SupabaseClient;
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
 * 
 * Provides contact search functionality with phone number validation, automatic search
 * on valid phone numbers, conversation history lookup, and dropdown menu management.
 * Handles click-outside detection for closing the contact dropdown.
 * 
 * @param props - Configuration object
 * @param props.supabase - Supabase client instance
 * @param props.workspace_id - Workspace ID for filtering contacts
 * @param props.contact_number - Initial contact phone number
 * @param props.potentialContacts - Initial list of potential contacts to display
 * @param props.dropdownRef - Ref to the dropdown element for click-outside detection
 * @param props.initialContact - Initially selected contact, if any
 * 
 * @returns Object containing:
 *   - selectedContact: Currently selected contact or null
 *   - isContactMenuOpen: Boolean indicating if contact dropdown is open
 *   - searchError: Error message string if search failed, null otherwise
 *   - contacts: Array of contacts matching the search
 *   - isValid: Boolean indicating if current phone number is valid
 *   - phoneNumber: Current phone number value
 *   - existingConversation: Latest conversation data if found, null otherwise
 *   - isSearching: Boolean indicating if search is in progress
 *   - setPhoneNumber: Function to manually set phone number
 *   - handleSearch: Function to handle phone number input changes
 *   - handleContactSelect: Function to handle contact selection from dropdown
 *   - toggleContactMenu: Function to toggle contact dropdown visibility
 *   - clearSelectedContact: Function to clear selected contact
 * 
 * @example
 * ```tsx
 * const dropdownRef = useRef<HTMLDivElement>(null);
 * 
 * const {
 *   selectedContact,
 *   contacts,
 *   isValid,
 *   phoneNumber,
 *   isSearching,
 *   handleSearch,
 *   handleContactSelect
 * } = useContactSearch({
 *   supabase,
 *   workspace_id: workspace.id,
 *   contact_number: '+1234567890',
 *   potentialContacts: [],
 *   dropdownRef,
 *   initialContact: null
 * });
 * 
 * // Use in input
 * <input
 *   value={phoneNumber}
 *   onChange={handleSearch}
 *   placeholder="Enter phone number"
 * />
 * 
 * // Display search results
 * {isSearching && <div>Searching...</div>}
 * {contacts.map(contact => (
 *   <div key={contact.id} onClick={() => handleContactSelect(contact)}>
 *     {contact.name}
 *   </div>
 * ))}
 * ```
 */
export function useContactSearch({
  supabase,
  workspace_id,
  contact_number,
  potentialContacts,
  dropdownRef,
  initialContact,
}: UseContactSearchProps) {
  const [isValid, setIsValid] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(contact_number);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(initialContact);
  const [isContactMenuOpen, setIsContactMenuOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>(potentialContacts || []);
  const [existingConversation, setExistingConversation] = useState<ExistingConversation | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhoneNumber(value);
    setIsValid(isValidPhoneNumber(value));
    setSelectedContact(null);
    setExistingConversation(null);
  }, []);

  const handleContactSelect = useCallback((contact: Contact) => {
    setSelectedContact(contact);
    setIsContactMenuOpen(false);
  }, []);

  const toggleContactMenu = useCallback(() => {
    setIsContactMenuOpen((prev) => !prev);
  }, []);

  const clearSelectedContact = useCallback(() => {
    setSelectedContact(null);
  }, []);

  const searchContact = useCallback(async (phoneNumber: string) => {
    setIsSearching(true);
    setSearchError(null);
    try {
      const { data, error } = await supabase.rpc("find_contact_by_phone", {
        p_workspace_id: workspace_id,
        p_phone_number: phoneNumber,
      });
      
      if (error) throw error;

      if (data && data.length > 0) {
        setContacts(data);
        setSelectedContact(null);
        setIsContactMenuOpen(true);
        setSearchError(null);
      } else {
        setContacts([]);
        setSelectedContact(null);
        setSearchError("No contact found. A new contact will be created.");
      }
    } catch (error) {
      console.error("Contact search error:", error);
      setContacts([]);
      setSelectedContact(null);
      const errorMessage = error instanceof Error 
        ? `Error searching for contact: ${error.message}`
        : "Unable to search for contact. Please try again.";
      setSearchError(errorMessage);
    } finally {
      setIsSearching(false);
    }
  }, [supabase, workspace_id]);

  const searchConversation = useCallback(async (phoneNumber: string) => {
    try {
      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
      const { data: latestMessage, error: messageSearchError } = await supabase
        .from("message")
        .select("*")
        .eq("workspace", workspace_id)
        .or(`from.eq.${normalizedPhoneNumber},to.eq.${normalizedPhoneNumber}`)
        .order("date_created", { ascending: false })
        .limit(1)
        .single();

      if (messageSearchError) {
        setExistingConversation(null);
      } else if (latestMessage) {
        setExistingConversation({
          phoneNumber: normalizedPhoneNumber,
          latestMessage: latestMessage.body,
          date: new Date(latestMessage.date_created).toLocaleString(),
        });
      } else {
        setExistingConversation(null);
      }
    } catch (error) {
      console.error("Conversation search error:", error);
      // Silently fail for conversation search - it's not critical
      setExistingConversation(null);
    }
  }, [supabase, workspace_id]);

  useEffect(() => {
    if (isValidPhoneNumber(contact_number)) {
      setPhoneNumber(contact_number);
      setIsValid(true);
    }
  }, [contact_number]);

  useEffect(() => {
    setSelectedContact(initialContact);
  }, [initialContact]);

  useEffect(() => {
    if (isValid && phoneNumber) {
      searchContact(phoneNumber);
      searchConversation(phoneNumber);
    } else {
      setContacts([]);
      setSelectedContact(null);
      setSearchError(null);
      setExistingConversation(null);
    }
  }, [phoneNumber, isValid, searchContact, searchConversation]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsContactMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

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