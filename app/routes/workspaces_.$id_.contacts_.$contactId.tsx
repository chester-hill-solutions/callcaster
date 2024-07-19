import { json, redirect } from "@remix-run/node";
import {
  useLoaderData,
  useSubmit,
} from "@remix-run/react";
import { useState } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Button } from "~/components/ui/button";
import {getUserRole} from "~/lib/database.server";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import ContactDetails from "~/components/ContactDetails";
import { Session, SupabaseClient } from "@supabase/supabase-js";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, contactId: selected_id } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspace_id)
    .single();

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const { data: contact, error: contactError } = await supabaseClient
    .from("contact")
    .select(`*, outreach_attempt(*, campaign(*))`)
    .eq("id", selected_id)
    .single();
  const { data: audiences, error: audiencesError } = await supabaseClient
    .from("audience")
    .select("*")
    .eq("workspace", workspace_id);

  if (audiencesError) throw audiencesError;

  const { data: contactAudiences, error: contactAudiencesError } =
    await supabaseClient
      .from("contact_audience")
      .select("audience_id")
      .eq("contact_id", contact.id);

  return json({
    workspace: workspaceData,
    workspace_id,
    selected_id,
    contact,
    userRole,
    audiences,
    contactAudiences,
  });
};

export const action = async ({ request, params }) => {
  const { contactId } = params;
  const contact = await request.json();
  delete contact.outreach_attempt;
  const {
    supabaseClient,
    headers,
    serverSession,
  }: {
    supabaseClient: SupabaseClient;
    headers: Headers;
    serverSession: Session;
  } = await getSupabaseServerClientWithSession(request);

  const { data: contactUpdate, error: updateError } = await supabaseClient
    .from("contact")
    .update(contact)
    .eq("id", contactId)
    .select();

  if (updateError) {
    console.log(updateError);
    return json({ success: false, error: updateError }, { headers });
  }
  return json({ success: false, error: updateError }, { headers });
};

export default function ScriptEditor() {
  const {
    contact: initContact,
    userRole,
    workspace,
    audiences,
    contactAudiences,
  } = useLoaderData();
  const [isChanged, setChanged] = useState(false);
  const [contact, setContact] = useState(initContact);
  const submit = useSubmit();

  const handleSave = () => {
    submit(contact, {
      method: "PATCH",
      encType: "application/json",
    });
  };

  const handleReset = () => {
    setContact(initContact);
    setChanged(false);
  };

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm">
      <WorkspaceNav workspace={workspace} userRole={userRole} />
      <div className="relative flex h-full flex-col overflow-visible">
        {isChanged && (
          <div className="fixed left-0 right-0 top-0 z-50 flex flex-col items-center justify-between bg-primary px-4 py-3 text-white shadow-md sm:flex-row sm:px-6 sm:py-5">
            <Button
              onClick={handleReset}
              className="mb-2 w-full rounded bg-white px-4 py-2 text-gray-500 transition-colors hover:bg-red-100 sm:mb-0 sm:w-auto"
            >
              Reset
            </Button>
            <div className="mb-2 text-center text-lg font-semibold sm:mb-0 sm:text-left">
              You have unsaved changes
            </div>
            <Button
              onClick={() => null}
              className="w-full rounded bg-secondary px-4 py-2 text-black transition-colors hover:bg-white sm:w-auto"
            >
              Save Changes
            </Button>
          </div>
        )}
        <div className="h-full flex-grow p-4">
          {contact && (
            <ContactDetails
              contact={contact}
              setContact={setContact}
              onSave={handleSave}
              audiences={audiences}
              contactAudiences={contactAudiences}
            />
          )}
        </div>
      </div>
    </main>
  );
}
