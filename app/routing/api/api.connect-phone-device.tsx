import { json } from "@remix-run/node";
import { requireWorkspaceAccess, safeParseJson } from "@/lib/database.server";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { twilio } from "@/twilio.server";
import { logger } from "@/lib/logger.server";
import { env } from "@/lib/env.server";

export const action = async ({ request }: { request: Request }) => {
    const { supabaseClient: supabase, headers } = await createSupabaseServerClient(request);
    const { data, error } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
        return json({ error: "Unauthorized" }, { status: 401 });
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
        return json({ error: "Invalid connect phone payload" }, { status: 400, headers });
    }

    await requireWorkspaceAccess({
        supabaseClient: supabase,
        user,
        workspaceId,
    });

    try {
        // Call the user's phone and connect them to the campaign conference
        const call = await twilio.calls.create({
            to: phoneNumber,
            from: env.TWILIO_PHONE_NUMBER(),
            url: `${env.BASE_URL()}/api/connect-campaign-conference/${workspaceId}/${campaignId}`,
            method: 'GET',
        });

        return json({ success: true, callSid: call.sid }, { headers });
    } catch (error: any) {
        logger.error('Error connecting phone device:', error);
        return json({ error: error.message }, { status: 500 });
    }
} 