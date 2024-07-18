import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

const initSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
};


const getContactsForAudience = async (supabase, audienceId) => {
  const { data: contacts, error } = await supabase
    .from("contact_audience")
    .select()
    .eq("audience_id", audienceId);
  console.log(contacts, error)
  if (error) throw error;
  return contacts.map(contact => contact.contact_id);
};

const handleQueueInsert = async (supabase, contactIds, campaignId) => {
  const update = contactIds.map(id => ({
    contact_id: id,
    status: "queued",
    campaign_id: campaignId,
  }));
  console.log(update)
  const { data, error } = await supabase
    .from("campaign_queue")
    .insert(update)
    .select();
  console.log(data)
  if (error) throw error;
  return data;
};

const handleQueueDelete = async (supabase, contactIds) => {
  const { data, error } = await supabase
    .from("campaign_queue")
    .delete()
    .in("contact_id", contactIds);

  if (error) throw error;
  return data;
};

const handleEvent = async (type, record, old_record) => {
  const supabase = initSupabaseClient();

  try {
    let result;
    if (type === "INSERT") {
      const contactIds = await getContactsForAudience(supabase, record.audience_id);
      if (contactIds.length > 0) {
        result = await handleQueueInsert(supabase, contactIds, record.campaign_id);
      }
    } else if (type === "DELETE") {
      const contactIds = await getContactsForAudience(supabase, old_record.audience_id);
      if (contactIds.length > 0) {
        result = await handleQueueDelete(supabase, contactIds);
      }
    }

    return result || null;
  } catch (error) {
    console.error("Error in handleEvent:", error);
    throw error;
  }
};

Deno.serve(async (req) => {
  try {
    const { type, record, old_record } = await req.json();
    console.log('Initiating Queue update: ', type, record, old_record);
    const result = await handleEvent(type, record, old_record);

    if (result) {
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      console.log("No records found or updated");
      return new Response(JSON.stringify({}), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Server error:", error);
    return new Response(JSON.stringify({ error: error.message, status: "error" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});