import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactForm } from "@/components/contact/ContactForm";
import { useEffect, useState } from "react";
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
  setDialog: (open: boolean | null) => void;
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

  useEffect(() => {
    setContact(existingContact || { phone: contact_number });
  }, [existingContact, contact_number]);

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
    <Dialog open={isDialogOpen} onOpenChange={() => setDialog(null)}>
      <DialogContent className="flex w-[450px] flex-col items-center bg-card">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            {existingContact?.id
              ? `Edit ${getDisplayName(contact)}`
              : `Add ${contact_number} to contacts`}
          </DialogTitle>
        </DialogHeader>
        <ContactForm
          isNew={!(contact?.id)}
          newContact={contact}
          handleInputChange={handleUpdateContact}
          handleSaveContact={handleSaveContact}
          workspace_id={workspace_id}
          audience_id={null}
        />
      </DialogContent>
    </Dialog>
  );
};

export default ChatAddContactDialog;
