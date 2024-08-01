import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ContactForm } from "~/components/ContactForm";
import { useEffect, useState } from "react";

const ChatAddContactDialog = ({
  isDialogOpen,
  setDialog,
  contact_number,
  workspace_id,
  existingContact,
}) => {
  const [contact, setContact] = useState(existingContact);

  const handleUpdateContact = (e) => {
    setContact((curr) => ({
      ...curr,
      [e.target.name]: e.target.value,
    }));
  };
  const handleSaveContact = (e) => {
    setDialog(false);
  };
  return (
    <Dialog open={isDialogOpen} onOpenChange={setDialog}>
      <DialogContent className="flex w-[450px] flex-col items-center bg-card">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            {existingContact?.id
              ? `Edit ${contact.firstname} ${contact.surname}`
              : `Add ${contact_number} to contacts`}
          </DialogTitle>
        </DialogHeader>
        <ContactForm
          isNew={!!existingContact?.id}
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
