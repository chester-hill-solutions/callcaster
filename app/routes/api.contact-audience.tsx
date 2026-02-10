import { json } from "@remix-run/node";
import { parseActionRequest, removeContactFromAudience } from "../lib/database.server";
import { verifyAuth } from "../lib/supabase.server";
import { createErrorResponse } from "@/lib/errors.server";

export const action = async ({ request }: { request: Request }) => {
    const { supabaseClient, headers } =
        await verifyAuth(request);

    const method = request.method;

    let response;
    if (method === 'DELETE'){
        const data = await parseActionRequest(request);
        const contactId = Number(data.contact_id);
        const audienceId = Number(data.audience_id);

        if (!contactId || !audienceId) {
            return json({ error: "contact_id and audience_id are required" }, { status: 400, headers });
        }

        try {
            response = await removeContactFromAudience(supabaseClient, contactId, audienceId);
        } catch (updateError) {
            return createErrorResponse(updateError, "Failed to remove contact from audience", 500);
        }
    }
    return json(response, {headers});
};
