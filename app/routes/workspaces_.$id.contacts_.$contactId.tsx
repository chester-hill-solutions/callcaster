import { FaPlus } from "react-icons/fa";
import { ActionFunctionArgs, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
<<<<<<< HEAD
import { verifyAuth } from "@/lib/supabase.server";
import { deepEqual } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getUserRole } from "@/lib/database.server";
import ContactDetails from "@/components/contact/ContactDetails";
import { Session, SupabaseClient } from "@supabase/supabase-js";
import { Audience, Contact, ContactAudience, WorkspaceData, User } from "../lib/types";
import { MemberRole } from "@/components/workspace/TeamMember";
=======
import { verifyAuth } from "~/lib/supabase.server";
import { deepEqual } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import ContactDetails from "~/components/ContactDetails";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Audience, Contact, ContactAudience, WorkspaceData, User } from "../lib/types";
import type { MemberRole } from "~/components/Workspace/TeamMember";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)

// Enhanced type definitions
export interface AudienceChanges {
  additions: ContactAudience[];
  deletions: ContactAudience[];
}

export interface LoaderData {
  workspace: WorkspaceData;
  workspace_id: string;
  selected_id: string;
  contact: Contact | null;
  userRole: MemberRole;
  audiences: Audience[];
}

export interface ContactFormData {
  id?: number;
  firstname?: string;
  surname?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  postal?: string;
  country?: string;
  external_id?: string;
  workspace: string;
}

export interface ContactScreenState {
  isDirty: boolean;
  isSaving: boolean;
  hasChanges: boolean;
}

export const loader = async ({ request, params }: LoaderFunctionArgs): Promise<Response> => {
  const { id: workspace_id, contactId: selected_id } = params;
  
  if (!workspace_id) {
    return redirect("/workspaces");
  }
  
  if (!selected_id) {
    return redirect(`/workspaces/${workspace_id}`);
  }

  try {
    const { supabaseClient, headers, user } = await verifyAuth(request);
    
    if (!user) {
      return redirect("/signin");
    }

    const { data: workspaceData, error: workspaceError } = await supabaseClient
      .from("workspace")
      .select()
      .eq("id", workspace_id)
      .single();
      
    if (workspaceError) {
      throw workspaceError;
    }

    const userRole = await getUserRole({ 
      supabaseClient: supabaseClient as SupabaseClient, 
      user: user as unknown as User, 
      workspaceId: workspace_id 
    });

    let contact: Contact | null = null;
    
    if (selected_id !== 'new') {
      const { data, error: contactError } = await supabaseClient
        .from("contact")
        .select(`*, outreach_attempt(*, campaign(*)), contact_audience(*)`)
        .eq("id", Number(selected_id) || 0)
        .filter("outreach_attempt.workspace", 'eq', workspace_id)
        .single();
        
      if (contactError) {
        throw contactError;
      }
      
      contact = data;
         } else {
       contact = null;
     }

    const { data: audiences, error: audiencesError } = await supabaseClient
      .from("audience")
      .select(`*`)
      .eq("workspace", workspace_id);

    if (audiencesError) {
      throw audiencesError;
    }

    return json({
      workspace: workspaceData,
      workspace_id,
      selected_id,
      contact,
      userRole,
      audiences: audiences || [],
    });
  } catch (error) {
    console.error('Error in contact loader:', error);
    return redirect(`/workspaces/${workspace_id}`);
  }
};

function compareContactAudiences(
  contactId: string,
  initialAudiences: ContactAudience[],
  currentAudiences: ContactAudience[],
): AudienceChanges {
  const additions: ContactAudience[] = [];
  const deletions: ContactAudience[] = [];
  
  try {
    currentAudiences?.forEach((currentAudience) => {
      if (currentAudience && currentAudience.audience_id) {
        if (
          !initialAudiences.some(
            (initialAudience) =>
              initialAudience && initialAudience.audience_id === currentAudience.audience_id,
          )
        ) {
          additions.push({
            contact_id: Number(contactId),
            audience_id: currentAudience.audience_id,
            created_at: new Date().toISOString(),
          });
        }
      }
    });
    
    initialAudiences.forEach((initialAudience) => {
      if (initialAudience && initialAudience.audience_id) {
        if (
          !currentAudiences.some(
            (currentAudience) =>
              currentAudience && currentAudience.audience_id === initialAudience.audience_id,
          )
        ) {
          deletions.push(initialAudience);
        }
      }
    });
  } catch (error) {
    console.error('Error comparing contact audiences:', error);
  }
  
  return { additions, deletions };
}

export const action = async ({ request, params }: ActionFunctionArgs): Promise<Response> => {
  const { id: workspace_id, contactId: selected_id } = params;
  
  if (!workspace_id || !selected_id) {
    return json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const { supabaseClient, headers, user } = await verifyAuth(request);
    
    if (!user) {
      return redirect("/signin");
    }

    const formData = await request.formData();
    const contactData: ContactFormData = {
      id: formData.get('id') ? Number(formData.get('id')) : undefined,
      firstname: formData.get('firstname') as string || undefined,
      surname: formData.get('surname') as string || undefined,
      phone: formData.get('phone') as string || undefined,
      email: formData.get('email') as string || undefined,
      address: formData.get('address') as string || undefined,
      city: formData.get('city') as string || undefined,
      province: formData.get('province') as string || undefined,
      postal: formData.get('postal') as string || undefined,
      country: formData.get('country') as string || undefined,
      external_id: formData.get('external_id') as string || undefined,
      workspace: workspace_id,
    };

    if (selected_id === 'new') {
      // Create new contact
      const { data: newContact, error: createError } = await supabaseClient
        .from("contact")
        .insert(contactData)
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      return json({ success: true, contact: newContact });
    } else {
      // Update existing contact
      const { data: updatedContact, error: updateError } = await supabaseClient
        .from("contact")
        .update(contactData)
        .eq("id", Number(selected_id))
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      return json({ success: true, contact: updatedContact });
    }
  } catch (error) {
    console.error('Error in contact action:', error);
    return json({ error: "Failed to save contact" }, { status: 500 });
  }
};

export default function ContactScreen(): JSX.Element {
  const { contact, workspace_id, selected_id, userRole, audiences } = useLoaderData<LoaderData>();
  const { setContact } = useOutletContext<{ setContact: (contact: Contact) => void }>();
  const submit = useSubmit();
  
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  const handleSave = useCallback((): void => {
    try {
      setIsSaving(true);
      submit({}, { method: "post" });
    } catch (error) {
      console.error('Error saving contact:', error);
    } finally {
      setIsSaving(false);
    }
  }, [submit]);

  const handleReset = useCallback((): void => {
    try {
      setIsDirty(false);
      setHasChanges(false);
    } catch (error) {
      console.error('Error resetting contact:', error);
    }
  }, []);

  useEffect(() => {
    if (contact && typeof contact.id === 'number') {
      setContact(contact);
    }
  }, [contact, setContact]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          {selected_id === 'new' ? 'New Contact' : 'Edit Contact'}
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
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <ContactDetails
        contact={contact}
        audiences={audiences}
        userRole={userRole}
        onDirtyChange={setIsDirty}
        onChangesChange={setHasChanges}
      />
    </div>
  );
}
