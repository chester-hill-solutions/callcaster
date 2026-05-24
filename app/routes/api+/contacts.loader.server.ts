import { bulkCreateContacts, createContact, handleError, parseRequestData, updateContact } from "@/lib/database.server";
import { Contact } from "@/lib/types";
import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { supabaseClient, user } = await verifyAuth(request);
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
      return routeData({ contacts: [] });
    } else {
      const { data: queuedContacts, error: queuedError } = await supabaseClient
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
}
