import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
  safeParseJson,
} from "@/lib/database.server";

export const action = async ({ request }: { request: Request }) => {

    const {headers } = await await getSession(request);
    const { data, error } = await adminDb.auth.getUser();
    const user = data.user;
    if (!user) {
        return routeData({ error: "Unauthorized" }, { status: 401 });
    }

    const { phoneNumber, workspaceId, campaignId } = await safeParseJson<{
        phoneNumber: string;
        workspaceId: string;
        campaignId?: string | number;
    }>(request);
    if (
        typeof phoneNumber !== "string" ||
        typeof workspaceId !== "string" ||
        (typeof campaignId !== "string" && typeof campaignId !== "number")
    ) {
        return routeData({ error: "Invalid connect phone payload" }, { status: 400, headers });
    }

    await requireWorkspaceAccess({user,
        workspaceId,
    });

    try {
        const twilio = await createWorkspaceTwilioInstance({
            client,
            workspace_id: workspaceId,
        });
        // Call the user's phone and connect them to the campaign conference
        const call = await twilio.calls.create({
            to: phoneNumber,
            from: env.TWILIO_PHONE_NUMBER(),
            url: `${env.BASE_URL()}/api/connect-campaign-conference/${workspaceId}/${campaignId}`,
            method: 'GET',
        });

        return routeData({ success: true, callSid: call.sid }, { headers });
    } catch (error: any) {
        logger.error('Error connecting phone device:', error);
        return routeData({ error: error.message }, { status: 500 });
    }
}
