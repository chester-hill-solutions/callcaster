import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactForm } from "@/components/contact/ContactForm";
import { useEffect, useState } from "react";
import { Contact } from "@/lib/types";

<<<<<<< HEAD:app/components/sms-ui/ChatAddContactDialog.tsx
const getDisplayName = (contact: Partial<Contact>) => {
=======
interface Contact {
  id?: number;
  firstname?: string;
  surname?: string;
  phone?: string;
  [key: string]: string | number | boolean | null | undefined;
}

const getDisplayName = (contact: Contact) => {
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/Chat/ChatAddContactDialog.tsx
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
<<<<<<< HEAD:app/components/sms-ui/ChatAddContactDialog.tsx
  setDialog: (open: boolean | null) => void;
  contact_number: string;
  workspace_id: string;
  existingContact?: Contact | null;
=======
  setDialog: (value: boolean | null) => void;
  contact_number: string;
  workspace_id: string;
  existingContact?: Contact;
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/Chat/ChatAddContactDialog.tsx
}

const ChatAddContactDialog = ({
  isDialogOpen,
  setDialog,
  contact_number,
  workspace_id,
  existingContact,
}: ChatAddContactDialogProps) => {
<<<<<<< HEAD:app/components/sms-ui/ChatAddContactDialog.tsx
  const [contact, setContact] = useState<Partial<Contact>>(
=======
  const [contact, setContact] = useState(
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/Chat/ChatAddContactDialog.tsx
    existingContact || { phone: contact_number },
  );

  useEffect(() => {
    setContact(existingContact || { phone: contact_number });
  }, [existingContact, contact_number]);

  const handleUpdateContact = (e: React.ChangeEvent<HTMLInputElement>) => {
<<<<<<< HEAD:app/components/sms-ui/ChatAddContactDialog.tsx
    setContact((curr) => ({
=======
    setContact((curr: Contact) => ({
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/Chat/ChatAddContactDialog.tsx
      ...curr,
      [e.target.name]: e.target.value,
    }));
  };
<<<<<<< HEAD:app/components/sms-ui/ChatAddContactDialog.tsx
  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
=======
  const handleSaveContact = (e: React.FormEvent<HTMLFormElement>) => {
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/Chat/ChatAddContactDialog.tsx
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
