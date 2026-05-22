import { data as routeData } from "react-router";



export const action = async ({ request }: { request: Request }) => {  const { createErrorResponse } = await import("@/lib/errors.server");
  const { verifyAuth } = await import("@/lib/supabase.server");
  const { parseActionRequest, removeContactFromAudience } = await import("@/lib/database.server");

    const { supabaseClient, headers } =
        await verifyAuth(request);

    const method = request.method;

    let response;
    if (method === 'DELETE'){
        const data = await parseActionRequest(request);
        const contactId = Number(data.contact_id);
        const audienceId = Number(data.audience_id);

        if (!contactId || !audienceId) {
            return routeData({ error: "contact_id and audience_id are required" }, { status: 400, headers });
        }

        try {
            response = await removeContactFromAudience(supabaseClient, contactId, audienceId);
        } catch (updateError) {
            return createErrorResponse(updateError, "Failed to remove contact from audience", 500);
        }
    }
    return routeData(response, {headers});
};
