import { safeParseJson } from "@/lib/database.server";
import { verifyAuth } from '../lib/supabase.server';
import { normalizePhoneNumber } from '../lib/utils';
import type { ActionFunctionArgs } from "@remix-run/node";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

interface InitiateIVRRequest {
  campaign_id: number;
  user_id: { id: string };
  workspace_id: string;
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { campaign_id, user_id, workspace_id }: InitiateIVRRequest = await safeParseJson(request);
    const { supabaseClient: supabase } = await verifyAuth(request);
    const { data, error } = await supabase
        .rpc('get_campaign_queue', { campaign_id_pro: campaign_id });
    if (error) throw error;
    logger.debug("Campaign queue data:", data);
    for (let i = 0; i < data?.length; i++) {
        let contact = data[i];
        const formData = new FormData();
        formData.append('user_id', user_id.id);
        formData.append('campaign_id', String(campaign_id));
        formData.append('workspace_id', workspace_id);
        formData.append('queue_id', contact.id);
        formData.append('contact_id', contact.contact_id);
        formData.append('caller_id', contact.caller_id);
        formData.append('to_number', normalizePhoneNumber(contact.phone));
        const res = await fetch(`${env.BASE_URL()}/api/ivr`, {
            body: formData,
            method: "POST",
        }).then(e => e.json()).catch((e) => {
            logger.error("Error initiating IVR call:", e);
            return null;
        })
        if (res.creditsError) {
            return {
                creditsError: true,
            }
        }
    }
    return data;
}
