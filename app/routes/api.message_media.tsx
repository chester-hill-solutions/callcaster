import { verifyAuth } from "../lib/supabase.server";
import { json } from "@remix-run/node";
import { logger } from "@/lib/logger.server";

function sanitizeFilename(filename: string) {
    const decodedFilename = decodeURIComponent(filename);
    const sanitized = decodedFilename.replace(/[^a-zA-Z0-9-_\.]/g, '')
        .replace(/\s+/g, '_');

    const parts = sanitized.split('.');
    const ext = parts.pop();
    const name = parts.join('_');

    return `${name}.${ext}`;
}

import type { ActionFunctionArgs } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {

    const { supabaseClient, headers } = await verifyAuth(request);
    const method = request.method;
    const formData = await request.formData();
    const workspaceId = formData.get('workspaceId')
    if (workspaceId == null) {
        return json(
            { success: false, error: "Workspace does not exist" },
            { headers },
        );
    }
    if (method === "POST") {
        const mediaToUpload = formData.get("image") as File | string | null;
        const mediaNameRaw = formData.get("fileName");
        const mediaName = typeof mediaNameRaw === 'string' ? mediaNameRaw : String(mediaNameRaw ?? '');
        const encodedMediaName = encodeURI(mediaName);
        const campaignIdRaw = formData.get("campaignId");
        const campaignId = campaignIdRaw == null ? null : Number(campaignIdRaw);
        const safeFileName = sanitizeFilename(encodedMediaName);

        const { error: uploadError } = await supabaseClient.storage
            .from("messageMedia")
            .upload(`${workspaceId}/${safeFileName}`, mediaToUpload as any, {
                cacheControl: "60",
                upsert: false,
            });
        if (uploadError && (uploadError as any).statusCode !== '409') {
            logger.error("Message media upload error:", uploadError);
            return json({ success: false, error: uploadError }, { headers });
        }
        if (campaignId) {
            const { data: campaign, error } = await supabaseClient
                .from('message_campaign')
                .select('id, message_media')
                .eq('campaign_id', campaignId as number)
                .single();
            if (error) {
                logger.error('Campaign Error', error);
                return json({ success: false, error: error }, { headers });
            }
            const { data: campaignUpdate, error: updateError } = await supabaseClient
                .from('message_campaign')
                .update({
                    message_media: [...((campaign?.message_media ?? []) as string[]), safeFileName]
                })
                .eq('campaign_id', campaignId as number)
                .select()
            if (updateError) {
                logger.error("Error updating campaign with media:", updateError);
                return json({ success: false, error: updateError }, { headers });
            }

            return json({ success: true, error: null, campaignUpdate }, { headers });
        } else {
            const { data, error: imageError } = await supabaseClient.storage.from('messageMedia').createSignedUrl(`${workspaceId}/${safeFileName}`, 3600);
            if (imageError) return json({ success: false, error: imageError }, { headers });
            return json({ success: true, error: null, url: data.signedUrl }, { headers });
        }
    } else if (method === "DELETE") {
        const campaignIdRaw = formData.get("campaignId");
        const campaignId = campaignIdRaw == null ? null : Number(campaignIdRaw);
        const mediaNameRaw = formData.get("fileName");
        const mediaName = typeof mediaNameRaw === 'string' ? mediaNameRaw : String(mediaNameRaw ?? '');
        const encodedMediaName = encodeURI(mediaName);
        const { data: campaign, error } = await supabaseClient
            .from("message_campaign")
            .select("id, message_media")
            .eq("campaign_id", campaignId as number)
            .single();
        if (error) {
            logger.error("Campaign Error", error);
            return json({ success: false, error: error }, { headers });
        }

        const { data: campaignUpdate, error: updateError } = await supabaseClient
            .from("message_campaign")
            .update({
                message_media: (campaign.message_media ?? []).filter(
                    (med) => med !== encodedMediaName,
                ),
            })
            .eq("campaign_id", campaignId as number)
            .select();

        if (updateError) {
            return json({ success: false, error: updateError }, { headers });
        }
        return json({ success: true, error: null, campaignUpdate }, { headers });
    }
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
}