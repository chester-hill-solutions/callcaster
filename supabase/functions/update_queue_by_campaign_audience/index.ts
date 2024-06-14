import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { type, table, schema, record, old_record } = await req.json();
  if (type === "INSERT") {
    try {
      const { data: contacts, error: contactError } = await supabase
        .from("contact")
        .select(
          `
      id,
      contact_audience!inner()
      `,
        )
        .eq("contact_audience.audience_id", record.audience_id);
      if (contactError) throw contactError;
      let ids = contacts.length && contacts.map((contact) => contact.id);
      if (ids.length > 0) {
        const update = ids.map((id) => ({
          contact_id: id,
          status: "queued",
          campaign_id: record.campaign_id,
        }));
        const { data: queueUpdate, error: queueUpdateError } = await supabase
          .from("campaign_queue")
          .insert(update);
        if (queueUpdateError) throw queueUpdateError;
        return new Response(JSON.stringify(queueUpdate), {
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (error) {
      console.log("Error", error);
      return new Response(JSON.stringify({ error, status: "error" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    console.log(`No records found`);
    return new Response(JSON.stringify({}), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (type === "DELETE") {
    try {
      const { data: contacts, error: contactError } = await supabase
        .from("contact")
        .select(
          `
      id,
      contact_audience!inner()
      `,
        )
        .eq("contact_audience.audience_id", old_record.audience_id);
      if (contactError) throw contactError;
      let ids = contacts.length && contacts.map((contact) => contact.id);
      if (ids.length > 0) {
        const { data: queueUpdate, error: queueUpdateError } = await supabase
          .from("campaign_queue")
          .delete()
          .in("contact_id", ids);
        if (queueUpdateError) throw queueUpdateError;
        return new Response(JSON.stringify(queueUpdate), {
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (error) {
      console.log("Error", error);
      return new Response(JSON.stringify({ error, status: "error" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    console.log(`No records found`);
    return new Response(JSON.stringify({}), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
