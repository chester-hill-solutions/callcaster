import { useCallback, useRef, useState } from "react";
import { useLoaderData, useSubmit } from "react-router";
import { toast } from "sonner";

import ContactDetails from "@/components/contact/ContactDetails";
import type { ContactDetailsHandle } from "@/components/contact/ContactDetails";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";

import type { ContactIdLoaderData } from "./$contactId.loader.server";

export { loader } from "./$contactId.loader.server";
export { action } from "./$contactId.action.server";
export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";

export default function ContactScreen() {
  const { contact, selected_id, userRole, audiences } =
    useLoaderData<ContactIdLoaderData>();
  const submit = useSubmit();
  const detailsRef = useRef<ContactDetailsHandle>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = useCallback((): void => {
    try {
      setIsSaving(true);
      const values = detailsRef.current?.getFormValues() ?? {};
      const formData = new FormData();
      for (const [key, value] of Object.entries(values)) {
        formData.set(key, value ?? "");
      }
      submit(formData, { method: "post" });
    } catch {
      toast.error("Couldn't save the contact. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [submit]);

  const handleReset = useCallback((): void => {
    detailsRef.current?.reset();
    setHasChanges(false);
  }, []);

  return (
    <PageShell
      title={selected_id === "new" ? "New Contact" : "Edit Contact"}
      maxWidth="content"
      actions={
        <>
          <Button
            onClick={handleReset}
            disabled={!hasChanges}
            variant="outline"
          >
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </>
      }
    >
      <ContactDetails
        ref={detailsRef}
        contact={contact ?? undefined}
        audiences={audiences}
        userRole={userRole}
        onChangesChange={setHasChanges}
        startEditable={selected_id === "new"}
      />
    </PageShell>
  );
}
