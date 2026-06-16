import { useCallback, useEffect, useState } from "react";
import { useLoaderData, useOutletContext, useSubmit } from "react-router";

import ContactDetails from "@/components/contact/ContactDetails";
import { Button } from "@/components/ui/button";
import type { Contact } from "@/lib/types";

import type { ContactIdLoaderData } from "./$contactId.loader.server";

export { loader } from "./$contactId.loader.server";
export { action } from "./$contactId.action.server";
export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";

export default function ContactScreen() {
  const { contact, selected_id, userRole, audiences } =
    useLoaderData<ContactIdLoaderData>();
  const { setContact } = useOutletContext<{
    setContact: (contact: Contact) => void;
  }>();
  const submit = useSubmit();

  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = useCallback((): void => {
    try {
      setIsSaving(true);
      submit({}, { method: "post" });
    } catch (error) {
      console.error("Error saving contact:", error);
    } finally {
      setIsSaving(false);
    }
  }, [submit]);

  const handleReset = useCallback((): void => {
    setHasChanges(false);
  }, []);

  useEffect(() => {
    if (contact && typeof contact.id === "number") {
      setContact(contact);
    }
  }, [contact, setContact]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {selected_id === "new" ? "New Contact" : "Edit Contact"}
        </h1>
        <div className="flex items-center space-x-2">
          <Button
            onClick={handleReset}
            disabled={!hasChanges}
            variant="outline"
          >
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <ContactDetails
        contact={contact ?? undefined}
        audiences={audiences}
        userRole={userRole}
        onChangesChange={setHasChanges}
      />
    </div>
  );
}
