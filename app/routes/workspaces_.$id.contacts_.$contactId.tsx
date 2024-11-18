import { FaPlus } from "react-icons/fa";
import { ActionFunctionArgs, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { deepEqual } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import ContactDetails from "~/components/ContactDetails";
import { Session, SupabaseClient } from "@supabase/supabase-js";
import { Audience, Contact, ContactAudience, WorkspaceData } from "../lib/types";
import { MemberRole } from "~/components/Workspace/TeamMember";

interface AudienceChanges {
  additions: ContactAudience[];
  deletions: ContactAudience[];
}

type LoaderData = {
  workspace: WorkspaceData;
  workspace_id: string;
  selected_id: string;
  contact: Contact;
  userRole: MemberRole;
  audiences: Audience[];
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, contactId: selected_id } = params;
  if (!workspace_id) return redirect("/workspaces");
  if (!selected_id) return redirect(`/workspaces/${workspace_id}`);

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
  if (workspaceError) throw workspaceError;
  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });

  let contact = null;
  if (selected_id !== 'new') {
    const { data, error: contactError } = await supabaseClient
      .from("contact")
      .select(`*, outreach_attempt(*, campaign(*)), contact_audience(*)`)
      .eq("id", selected_id)
      .filter("outreach_attempt.workspace", 'eq', workspace_id)
      .single();
    if (contactError) throw contactError;
    contact = data;
  } else {
    contact = {
      id: 'new',
      contact_audience: [],
      outreach_attempt: [],
    };
  }

  const { data: audiences, error: audiencesError } = await supabaseClient
    .from("audience")
    .select(`*`)
    .eq("workspace", workspace_id);

  return json({
    workspace: workspaceData,
    workspace_id,
    selected_id,
    contact,
    userRole,
    audiences,
  });
};

function compareContactAudiences(
  contactId: string,
  initialAudiences: ContactAudience[],
  currentAudiences: ContactAudience[],
): AudienceChanges {
  const additions: ContactAudience[] = [];
  const deletions: ContactAudience[] = [];
  currentAudiences?.forEach((currentAudience) => {
    if (
      !initialAudiences.some(
        (initialAudience) =>
          initialAudience.audience_id === currentAudience.audience_id,
      )
    ) {
      additions.push({
        contact_id: contactId,
        audience_id: currentAudience.audience_id,
      });
    }
  });
  initialAudiences.forEach((initialAudience) => {
    if (
      !currentAudiences.some(
        (currentAudience) =>
          currentAudience.audience_id === initialAudience.audience_id,
      )
    ) {
      deletions.push({
        contact_id: contactId,
        audience_id: initialAudience.audience_id,
      });
    }
  });

  return { additions, deletions };
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { contactId, id: workspaceId } = params;
  const contact = await request.json();
  
  const { supabaseClient, headers, serverSession } = 
    await getSupabaseServerClientWithSession(request);

  const {id, initial_audiences, contact_audience, ...contactData} = contact;

  let savedContact = null;
  if (contactId === 'new') {
    const { data: newContact, error: createError } = await supabaseClient
      .from("contact")
      .insert({ ...contactData, workspace: workspaceId })
      .select()
      .single();
    if (createError) {
      return json({ success: false, error: createError }, { headers });
    }
    savedContact = newContact;
  }
  if (!savedContact) {
    return json({ success: false, error: "Failed to create contact" }, { headers });
  }
  const { additions, deletions } = compareContactAudiences(
    savedContact.id.toString(),
    initial_audiences,
    contact_audience,
  );

  if (deletions.length > 0) {
    const { error: deleteError } = await supabaseClient
      .from("contact_audience")
      .delete()
      .in("contact_id", [contactId])
      .in(
        "audience_id",
        deletions.map((d) => d.audience_id),
      );
    if (deleteError) {
      console.error("Error deleting contact audiences:", deleteError);
      return json(
        { success: false, error: deleteError.message },
        { status: 400 },
      );
    }
  }
  if (additions.length > 0) {
    const { error: insertError } = await supabaseClient
      .from("contact_audience")
      .insert(additions.map(a => ({
        audience_id: Number(a?.audience_id),
        contact_id: Number(a?.contact_id)
      })));

    if (insertError) {
      console.error("Error inserting contact audiences:", insertError);
      return json(
        { success: false, error: insertError.message },
        { status: 400 },
      );
    }
  }

  if (contactId !== 'new') {
    return redirect(`/workspaces/${workspaceId}/contacts/${contactId}`);
  }
  const { data: contactUpdate, error: updateError } = await supabaseClient
    .from("contact")
    .update(contactData)
    .eq("id", Number(contactId))
    .select();

  if (updateError) {
    console.log(updateError);
    return json({ success: false, error: updateError }, { headers });
  }
  return json({ success: true, contact: contactUpdate }, { headers });
};

export default function ContactScreen() {
  const {
    contact: initContact,
    userRole,
    workspace,
    audiences,
  } = useLoaderData<LoaderData>();
  const [isChanged, setChanged] = useState(false);
  const [contact, setContact] = useState(initContact);
  const submit = useSubmit();

  const handleAudience = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { checked, value } = e.target;
      const audienceId = parseInt(value);
      setContact((prevContact) => {
        if (!prevContact) return prevContact;

        let updatedContactAudience: ContactAudience[];

        if (checked) {
          if (
            !prevContact.contact_audience?.some(
              (ca) => ca.audience_id === audienceId,
            )
          ) {
            updatedContactAudience = [
              ...prevContact.contact_audience,
              { contact_id: prevContact.id, audience_id: audienceId },
            ];
          } else {
            updatedContactAudience = prevContact.contact_audience;
          }
        } else {
          updatedContactAudience = prevContact.contact_audience.filter(
            (ca) => ca.audience_id !== audienceId,
          );
        }

        return {
          ...prevContact,
          contact_audience: updatedContactAudience,
        };
      });
    },
    [setContact],
  );

  const handleSave = () => {
    submit(
      { ...contact, initial_audiences: initContact?.contact_audience || [] },
      {
        method: "PATCH",
        encType: "application/json",
      },
    );
  };

  const handleReset = () => {
    setContact(initContact);
    setChanged(false);
  };

  return (
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
        <ContactDetails
          contact={contact}
          setContact={setContact}
          onSave={handleSave}
          audiences={audiences}
          handleAudience={handleAudience}
        />
      </div>
    </div>
  );
}
