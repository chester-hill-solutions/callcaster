import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ContactForm } from "~/components/ContactForm";
import { Form } from "@remix-run/react";
import { useState } from "react";

const ChatAddContactDialog = ({ isDialogOpen, setDialog, contact_number, workspace_id }) => {
  const [contact, setContact] = useState({
    firstname: "",
    surname: "",
    phone: contact_number,
    email: "",
    address: "",
  });
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
            Add {contact_number} to contacts
          </DialogTitle>
        </DialogHeader>
            <ContactForm
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