import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ContactForm } from "@/components/contact/ContactForm";
import { useState } from "react";
import { Contact } from "@/lib/types";

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
  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    setDialog(false);
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
