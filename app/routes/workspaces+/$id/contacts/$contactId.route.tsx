import { useCallback, useRef, useState } from "react";
import { useActionData, useLoaderData, useSubmit, useNavigation, useNavigate } from "react-router";

import ContactDetails from "@/components/contact/ContactDetails";
import type { ContactDetailsHandle } from "@/components/contact/ContactDetails";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { contactEditorSnapshot } from "@/lib/contact-editor";
import type { Contact } from "@/lib/types";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

import type { ContactIdLoaderData } from "./$contactId.loader.server";

type ActionResponse = { success?: boolean; created?: boolean; contact?: Contact; warning?: string; error?: string };

export { loader } from "./$contactId.loader.server";
export { action } from "./$contactId.action.server";
export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";

export default function ContactScreen() {
  const { contact, workspace_id, selected_id, userRole, audiences } =
    useLoaderData<ContactIdLoaderData>();
  const actionData = useActionData<ActionResponse>();
  const navigate = useNavigate();

  const openCreatedContact = useCallback((result: ActionResponse) => {
    if (selected_id === "new" && result.success && result.created && result.contact?.workspace === workspace_id) {
      void navigate(`/workspaces/${workspace_id}/contacts/${result.contact.id}`, { replace: true });
    }
  }, [navigate, selected_id, workspace_id]);

  useActionFeedback(actionData, {
    successMessage:
      selected_id === "new"
        ? "Contact created successfully"
        : "Contact saved successfully",
    errorMessage: "Couldn't save the contact. Please try again.",
    getWarning: (data) => data?.warning,
    onSuccess: openCreatedContact,
    onWarning: openCreatedContact,
  });


  return <ContactEditor key={`${workspace_id}:${selected_id}:${contactEditorSnapshot(contact ?? undefined)}`}
    contact={contact} selected_id={selected_id} userRole={userRole} audiences={audiences}
    startEditable={selected_id === "new" || Boolean(actionData?.success && actionData.contact?.workspace === workspace_id && String(actionData.contact.id) === selected_id)} />;
}

function ContactEditor({ contact, selected_id, userRole, audiences, startEditable }: Pick<ContactIdLoaderData, "contact" | "selected_id" | "userRole" | "audiences"> & { startEditable: boolean }) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const detailsRef = useRef<ContactDetailsHandle>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const isSaving = navigation.state !== "idle";

  const handleSave = useCallback((): void => {
    const values = detailsRef.current?.getFormValues() ?? {};
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      formData.set(key, value ?? "");
    }
    submit(formData, { method: "post" });
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
            disabled={!hasChanges || isSaving}
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
        disabled={isSaving}
        contact={contact ?? undefined}
        audiences={audiences}
        userRole={userRole}
        onChangesChange={setHasChanges}
        startEditable={startEditable}
      />
    </PageShell>
  );
}
