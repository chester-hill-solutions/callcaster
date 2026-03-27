import { ActionFunctionArgs, json } from "@remix-run/node";
import { parseActionRequest, removeContactsFromAudience } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401, headers });
  }

  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405, headers });
  }

  const data = await parseActionRequest(request);
  const audienceIdStr = String(data.audience_id ?? "");
  const contactIdsRaw = data["contact_ids[]"];
  const contactIdsStr = Array.isArray(contactIdsRaw)
    ? contactIdsRaw.map(String)
    : contactIdsRaw != null
    ? [String(contactIdsRaw)]
    : [];

  if (!audienceIdStr) {
    return json({ error: "Audience ID is required" }, { status: 400, headers });
  }

  if (!contactIdsStr || contactIdsStr.length === 0) {
    return json({ error: "At least one contact ID is required" }, { status: 400, headers });
  }

  try {
    const audienceId = parseInt(audienceIdStr, 10);
    const contactIds = contactIdsStr.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n));

    const { removed_count, new_total } = await removeContactsFromAudience(
      supabaseClient,
      audienceId,
      contactIds
    );

    return json(
      {
        success: true,
        message: `${removed_count} contacts removed from audience`,
        removed_count,
        new_total,
      },
      { headers }
    );
  } catch (error) {
    logger.error("Error removing contacts from audience:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return json({ error: errorMessage }, { status: 500, headers });
  }
} 