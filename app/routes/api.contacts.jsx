import { json } from "@remix-run/node";
import { bulkCreateContacts, createContact, handleError, parseRequestData, updateContact } from "../lib/database.server";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers } = await getSupabaseServerClientWithSession(request);
    const method = request.method;
  
    try {
      const data = await parseRequestData(request);
  
      switch (method) {
        case 'PATCH':
          const updatedContact = await updateContact(supabaseClient, data);
          return json({ data: updatedContact }, { status: 200 });
  
        case 'POST':
          if (Array.isArray(data.contacts)) {
            const bulkResult = await bulkCreateContacts(supabaseClient, data.contacts, data.workspace_id, data.audience_id);
            return json(bulkResult);
          } else {
            const newContact = await createContact(supabaseClient, data, data.audience_id);
            return json(newContact);
          }
  
        default:
          return json({ error: 'Unsupported request method' }, { status: 400 });
      }
    } catch (err) {
      if (err.message === 'Unsupported content type') {
        return json({ error: 'Unsupported content type' }, { status: 415 });
      }
      return handleError(err, 'An unexpected error occurred');
    }
  };
  