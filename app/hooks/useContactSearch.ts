import { SupabaseClient } from "@supabase/supabase-js";
import { MutableRefObject, useEffect, useState, useCallback } from "react";
import { Contact } from "~/lib/types";

const phoneRegex = /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;

function normalizePhoneNumber(input: string): string {
  let cleaned = input.replace(/[^0-9+]/g, "");
  if (cleaned.indexOf("+") > 0) {
    cleaned = cleaned.replace(/\+/g, "");
  }
  if (!cleaned.startsWith("+1")) {
    cleaned = "+1" + cleaned;
  }
  return cleaned;
}

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

export function useContactSearch({
  supabase,
  workspace_id,
  contact_number,
  potentialContacts,
  dropdownRef,
  initialContact
}: UseContactSearchProps) {
  const [isValid, setIsValid] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(contact_number);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(initialContact);
  const [isContactMenuOpen, setIsContactMenuOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>(potentialContacts || []);
  const [existingConversation, setExistingConversation] = useState<ExistingConversation | null>(null);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhoneNumber(value);
    setIsValid(phoneRegex.test(value));
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

  useEffect(() => {
    setPhoneNumber(contact_number);
    setIsValid(phoneRegex.test(contact_number));
  }, [contact_number]);

  useEffect(() => {
    setSelectedContact(initialContact);
  }, [initialContact]);

  useEffect(() => {
    const searchContact = async () => {
      if (isValid && phoneNumber) {
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
            setExistingConversation(null);
          } else {
            setContacts([]);
            setSelectedContact(null);
            if (phoneNumber.length > 8) {
              const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
              const { data: latestMessage, error: messageSearchError } = await supabase
                .from("message")
                .select("*")
                .eq("workspace", workspace_id)
                .or(`from.eq.${normalizedPhoneNumber},to.eq.${normalizedPhoneNumber}`)
                .order('date_created', { ascending: false })
                .limit(1)
                .single();

              if (messageSearchError) {
                setSearchError(messageSearchError.message);
                setExistingConversation(null);
              } else if (latestMessage) {
                setExistingConversation({
                  phoneNumber: normalizedPhoneNumber,
                  latestMessage: latestMessage.body,
                  date: new Date(latestMessage.date_created).toLocaleString(),
                });
                setSearchError(null);
              } else {
                setExistingConversation(null);
                setSearchError("No contact or conversation found. A new contact will be created.");
              }
            }
          }
        } catch (error) {
          console.error("Contact search error:", error);
          setContacts([]);
          setSelectedContact(null);
          setSearchError("Error searching for contact.");
          setExistingConversation(null);
        }
      } else {
        setContacts([]);
        setSelectedContact(null);
        setSearchError(null);
        setExistingConversation(null);
      }
    };

    searchContact();
  }, [phoneNumber, isValid, supabase, workspace_id]);

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
    setPhoneNumber,
    handleSearch,
    handleContactSelect,
    toggleContactMenu,
    clearSelectedContact,
  };
}