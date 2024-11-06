import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { bulkCreateContacts, createContact, handleError, parseRequestData, updateContact } from "../lib/database.server";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import { Contact } from "~/lib/types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers, serverSession } = await getSupabaseServerClientWithSession(request);
  const method = request.method;

  try {
    const data = await parseRequestData(request);

    switch (method) {
      case 'PATCH':
        const updatedContact = await updateContact(supabaseClient, data);
        return json({ data: updatedContact }, { status: 200 });

      case 'POST':
        if (Array.isArray(data.contacts)) {
          const bulkResult = await bulkCreateContacts(supabaseClient, data.contacts, data.workspace_id, data.audience_id, serverSession.user.id);
          return json(bulkResult);
        } else {
          const newContact = await createContact(supabaseClient, data, data.audience_id, serverSession.user.id);
          return json(newContact);
        }

      default:
        return json({ error: 'Unsupported request method' }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Unsupported content type') {
      return json({ error: 'Unsupported content type' }, { status: 415 });
    }
    return handleError(err, 'An unexpected error occurred');
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient, serverSession } = await getSupabaseServerClientWithSession(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q")?.toLowerCase() || "";
  const workspaceId = url.searchParams.get("workspace_id") || "";
  const campaignId = url.searchParams.get("campaign_id") || "";

  if (!searchQuery) {
    return json({ data: [] });
  }

  try {
    const [
      { data: contacts, error },
      { data: phoneContacts, error: phoneError },
      { data: emailContacts, error: emailError }
    ] = await Promise.all([
      supabaseClient
        .from('contact')
        .select(`*, contact_audience(audience_id)`)
        .textSearch('fullname', searchQuery)
        .eq('workspace', workspaceId)
        .limit(10),
      supabaseClient
        .from('contact')
        .select('*, contact_audience(audience_id)')
        .ilike('phone', `%${searchQuery}%`)
        .eq('workspace', workspaceId)
        .limit(10),
      supabaseClient
        .from('contact')
        .select('*, contact_audience(audience_id)')
        .ilike('email', `%${searchQuery}%`)
        .eq('workspace', workspaceId)
        .limit(10)
    ]);
    if (error || phoneError || emailError) throw error || phoneError || emailError;
    const allContacts = [...contacts, ...phoneContacts, ...emailContacts].filter(Boolean) as Contact[];
    if (allContacts.length === 0) {
      return json({ contacts: [] });
    } else {
      const { data: queuedContacts, error: queuedError } = await supabaseClient
        .from('campaign_queue')
        .select('contact_id')
        .eq('campaign_id', campaignId)
        .in('contact_id', allContacts.map((contact) => contact?.id))
      if (queuedError) throw queuedError;
      const contacts = allContacts.map((contact) => ({
        ...contact,
        queued: queuedContacts.some((queuedContact) => queuedContact.contact_id === contact?.id)
      }));
      return json({ contacts });
    }
  } catch (err) {
    return handleError(err, 'Error searching contacts');
  }
};