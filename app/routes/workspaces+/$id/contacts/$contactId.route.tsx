import { useCallback, useRef, useState } from "react";
import { useActionData, useLoaderData, useSubmit } from "react-router";

import ContactDetails from "@/components/contact/ContactDetails";
import type { ContactDetailsHandle } from "@/components/contact/ContactDetails";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

import type { ContactIdLoaderData } from "./$contactId.loader.server";

type ActionResponse = { success?: boolean; warning?: string; error?: string };

export { loader } from "./$contactId.loader.server";
export { action } from "./$contactId.action.server";
export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";

export default function ContactScreen() {
  const { contact, selected_id, userRole, audiences } =
    useLoaderData<ContactIdLoaderData>();
  const actionData = useActionData<ActionResponse>();
  const submit = useSubmit();
  const detailsRef = useRef<ContactDetailsHandle>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useActionFeedback(actionData, {
    successMessage:
      selected_id === "new"
        ? "Contact created successfully"
        : "Contact saved successfully",
    errorMessage: "Couldn't save the contact. Please try again.",
    getWarning: (data) => data?.warning,
  });

  const handleSave = useCallback((): void => {
    setIsSaving(true);
    const values = detailsRef.current?.getFormValues() ?? {};
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      formData.set(key, value ?? "");
    }
    submit(formData, { method: "post" });
    setIsSaving(false);
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
