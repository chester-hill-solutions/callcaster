import { ActionFunctionArgs, json } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401, headers });
  }

  // Only allow DELETE requests
  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405, headers });
  }

  const formData = await request.formData();
  const audienceIdStr = formData.get("audience_id") as string;
  const contactIdsStr = formData.getAll("contact_ids[]") as string[];

  if (!audienceIdStr) {
    return json({ error: "Audience ID is required" }, { status: 400, headers });
  }

  if (!contactIdsStr || contactIdsStr.length === 0) {
    return json({ error: "At least one contact ID is required" }, { status: 400, headers });
  }

  try {
    const audienceId = parseInt(audienceIdStr, 10);
    const contactIds = contactIdsStr.map(id => parseInt(id, 10));

    // Delete the contact-audience relationships
    const { error } = await supabaseClient
      .from("contact_audience")
      .delete()
      .eq("audience_id", audienceId)
      .in("contact_id", contactIds);

    if (error) {
      return json({ error: error.message }, { status: 500, headers });
    }

    // Update the audience count
    const { data: countData } = await supabaseClient
      .from("contact_audience")
      .select("contact_id", { count: "exact" })
      .eq("audience_id", audienceId);

    const newCount = countData?.length || 0;

    // Update the audience with the new count
    // Note: Check your actual schema to see what field stores the contact count
    await supabaseClient
      .from("audience")
      .update({ total_contacts: newCount })
      .eq("id", audienceId);

    return json(
      { 
        success: true, 
        message: `${contactIds.length} contacts removed from audience`,
        removed_count: contactIds.length,
        new_total: newCount
      }, 
      { headers }
    );
  } catch (error) {
    console.error("Error removing contacts from audience:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return json({ error: errorMessage }, { status: 500, headers });
  }
} 