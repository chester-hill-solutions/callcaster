import { createSupabaseServerClient } from "@/lib/supabase.server";
import { bulkCreateContacts, createContact, handleError, parseRequestData, updateContact } from "@/lib/database.server";
import { Contact } from "@/lib/types";
import { data as routeData } from "react-router";
import { getDualAuthSupabase, getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const supabase = getDualAuthSupabase(auth);
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q")?.toLowerCase() || "";
  const workspaceId = url.searchParams.get("workspace_id") || "";
  const campaignId = url.searchParams.get("campaign_id") || "";

  if (!searchQuery) {
    return routeData({ data: [] });
  }

  try {
    const [
      { data: contacts, error },
      { data: phoneContacts, error: phoneError },
      { data: emailContacts, error: emailError }
    ] = await Promise.all([
      supabase
        .from('contact')
        .select(`*, contact_audience(audience_id)`)
        .textSearch('fullname', searchQuery)
        .eq('workspace', workspaceId)
        .limit(10),
      supabase
        .from('contact')
        .select('*, contact_audience(audience_id)')
        .ilike('phone', `%${searchQuery}%`)
        .eq('workspace', workspaceId)
        .limit(10),
      supabase
        .from('contact')
        .select('*, contact_audience(audience_id)')
        .ilike('email', `%${searchQuery}%`)
        .eq('workspace', workspaceId)
        .limit(10)
    ]);
    if (error || phoneError || emailError) throw error || phoneError || emailError;
    const allContacts = [...contacts, ...phoneContacts, ...emailContacts].filter(Boolean) as Contact[];
    if (allContacts.length === 0) {
      return routeData({ contacts: [] });
    } else {
      const { data: queuedContacts, error: queuedError } = await supabase
        .from('campaign_queue')
        .select('contact_id')
        .eq('campaign_id', Number(campaignId))
        .in('contact_id', allContacts.map((contact) => contact?.id))
      if (queuedError) throw queuedError;
      const contacts = allContacts.map((contact) => ({
        ...contact,
        queued: queuedContacts.some((queuedContact) => queuedContact.contact_id === contact?.id)
      }));
      return routeData({ contacts });
    }
  } catch (err) {
    return handleError(err instanceof Error ? err : new Error(String(err)), 'Error searching contacts');
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {

  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = createSupabaseServerClient(request);
  const supabase = getDualAuthSupabase(auth);
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
  const method = request.method;

  try {
    const data = await parseRequestData(request);

    switch (method) {
      case 'PATCH': {
        const updatedContact = await updateContact(data.workspace_id, data);
        return routeData({ data: updatedContact }, { status: 200 });
      }

      case 'POST':
        if (Array.isArray(data.contacts)) {
            const bulkResult = await bulkCreateContacts(
              data.contacts,
              data.workspace_id,
              data.audience_id,
              user.id,
            );
          return routeData(bulkResult);
        } else {
          const newContact = await createContact(data, data.audience_id, user.id);
          return routeData(newContact);
        }

      default:
        return routeData({ error: 'Unsupported request method' }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Unsupported content type') {
      return routeData({ error: 'Unsupported content type' }, { status: 415 });
    }
    return handleError(err instanceof Error ? err : new Error(String(err)), 'An unexpected error occurred');
  }
}
