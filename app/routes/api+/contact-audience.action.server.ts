import { getSession } from "@/lib/auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { data as routeData } from "react-router";
import { removeContactFromAudience } from "@/lib/database/contact-audience.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { parseActionRequest } from "@/lib/request-utils.server";
import { findAudienceWorkspaceById } from "@/lib/audience-upload-db.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: ({ request }) => requireDualAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const { headers } = await getSession(request);
    const user = getDualAuthUser(auth);
    if (!user) {
      return routeData({ error: "Unauthorized" }, { status: 401, headers });
    }
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
            const workspaceId = await findAudienceWorkspaceById(audienceId);
            if (!workspaceId) {
              return routeData({ error: "Audience not found" }, { status: 404, headers });
            }
            await requireWorkspaceAccess({ user, workspaceId });
            response = await removeContactFromAudience(contactId, audienceId);
        } catch (updateError) {
            return createErrorResponse(updateError, "Failed to remove contact from audience", 500);
        }
    }
    return routeData(response, {headers});
  },
});
