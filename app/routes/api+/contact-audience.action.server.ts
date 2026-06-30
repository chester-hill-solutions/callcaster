import { getSession } from "@/lib/auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { data as routeData } from "react-router";
import { parseActionRequest, removeContactFromAudience } from "@/lib/database.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";


export const action = async ({ request }: { request: Request }) => {

    const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = await getSession(request);
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
            response = await removeContactFromAudience(contactId, audienceId);
        } catch (updateError) {
            return createErrorResponse(updateError, "Failed to remove contact from audience", 500);
        }
    }
    return routeData(response, {headers});
}
