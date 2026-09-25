import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ContactForm } from "@/components/contact/ContactForm";
import { useFetcher } from "react-router";
import { useEffect, useRef, useState } from "react";
import { Contact } from "@/lib/types";
import { toast } from "sonner";

const getDisplayName = (contact: Partial<Contact>) => {
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

interface ChatAddContactDialogProps {
  isDialogOpen: boolean;
  setDialog: (open: boolean) => void;
  contact_number: string;
  workspace_id: string;
  existingContact?: Contact | null;
}

const ChatAddContactDialog = ({
  isDialogOpen,
  setDialog,
  contact_number,
  workspace_id,
  existingContact,
}: ChatAddContactDialogProps) => {
  const [contact, setContact] = useState<Partial<Contact>>(
    existingContact || { phone: contact_number },
  );

  const [prevContactSource, setPrevContactSource] = useState({
    existingContact,
    contact_number,
  });
  if (
    prevContactSource.existingContact !== existingContact ||
    prevContactSource.contact_number !== contact_number
  ) {
    setPrevContactSource({ existingContact, contact_number });
    setContact(existingContact || { phone: contact_number });
  }

  const handleUpdateContact = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContact((curr) => ({
      ...curr,
      [e.target.name]: e.target.value,
    }));
  };
  const createFetcher = useFetcher<Contact | { error: string }>();
  const createSubmittedRef = useRef(false);

  /**
   * @effect Handle the completed contact-create request once per submission.
   * @effect-deps createFetcher state/data (waits for the POST result), setDialog
   * @effect-side-effects toast + closes the sheet after a successful create
   * @effect-why-not-loader The result is from this client-side form submission.
   */
  useEffect(() => {
    if (createFetcher.state !== "idle" || !createSubmittedRef.current) return;

    createSubmittedRef.current = false;
    const response = createFetcher.data;
    if (!response) {
      toast.error("Contact could not be created.");
      return;
    }
    if ("error" in response) {
      toast.error(response.error);
      return;
    }
    setDialog(false);
  }, [createFetcher.data, createFetcher.state, setDialog]);

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    createSubmittedRef.current = true;
    createFetcher.submit(formData, { method: "POST", action: "/api/contacts" });
  };
  return (
    <Sheet open={isDialogOpen} onOpenChange={setDialog}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {existingContact?.id
              ? `Edit ${getDisplayName(contact)}`
              : `Add ${contact_number} to contacts`}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Contact details form
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col items-center py-4">
          <ContactForm
            isNew={!(contact?.id)}
            newContact={contact}
            handleInputChange={handleUpdateContact}
            handleSaveContact={handleSaveContact}
            workspace_id={workspace_id}
            audience_id={null}
            assignToDefaultSmsAudience={!(contact?.id)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ChatAddContactDialog;
