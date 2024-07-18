import { FaPlus } from "react-icons/fa";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useState, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import CampaignSettingsScript from "../components/CampaignSettings.Script";
import { deepEqual } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  getMedia,
  getRecordingFileNames,
  getSignedUrls,
  getUserRole,
  getWorkspaceScripts,
  listMedia,
} from "~/lib/database.server";
import { MessageSettings } from "../components/MessageSettings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
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

  return json({
    workspace: workspaceData,
    workspace_id,
    selected_id,
    contact,
    userRole,
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
    workspace_id,
    selected_id,
    contact: initContact,
    userRole,
    workspace,
  } = useLoaderData();
  const [isChanged, setChanged] = useState(false);
  const [contact, setContact] = useState(initContact);
  const submit = useSubmit();

  const handleSave = () => {
    submit(contact, {
      method: "PATCH",
      encType:"application/json"
    });
  };

  const handleReset = () => {
    setContact(initContact);
    setChanged(false);
  };

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm">
      <WorkspaceNav
        workspace={workspace}
        isInChildRoute={true}
        userRole={userRole}
      />

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
          <ContactDetails contact={contact} setContact={setContact} onSave={handleSave} />
        </div>
      </div>
    </main>
  );
}
