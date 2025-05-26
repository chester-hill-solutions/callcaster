import { json } from "@remix-run/node";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { twilio } from "~/twilio.server";

export const action = async ({ request }: { request: Request }) => {
    const { supabaseClient: supabase, headers } = await createSupabaseServerClient(request);
    const { data, error } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const { phoneNumber, workspaceId, campaignId } = await request.json();

    try {
        // Call the user's phone and connect them to the campaign conference
        const call = await twilio.calls.create({
            to: phoneNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${process.env.BASE_URL}/api/connect-campaign-conference/${workspaceId}/${campaignId}`,
            method: 'GET',
        });

        return json({ success: true, callSid: call.sid }, { headers });
    } catch (error: any) {
        console.error('Error connecting phone device:', error);
        return json({ error: error.message }, { status: 500 });
    }
} 