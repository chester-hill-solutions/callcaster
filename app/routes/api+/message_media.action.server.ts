import { createSupabaseServerClient } from "@/lib/supabase.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { getDualAuthSupabase, getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";

function sanitizeFilename(filename: string) {
    const decodedFilename = decodeURIComponent(filename);
    const sanitized = decodedFilename.replace(/[^a-zA-Z0-9-_.]/g, '')
        .replace(/\s+/g, '_');

    const parts = sanitized.split('.');
    const ext = parts.pop();
    const name = parts.join('_');

    return `${name}.${ext}`;
}

export async function action({ request }: ActionFunctionArgs) {

    const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = createSupabaseServerClient(request);
  const supabase = getDualAuthSupabase(auth);
    const method = request.method;
    const formData = await request.formData();
    const workspaceId = formData.get('workspaceId')
    if (workspaceId == null) {
        return routeData(
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

        const { error: uploadError } = await supabase.storage
            .from("messageMedia")
            .upload(`${workspaceId}/${safeFileName}`, mediaToUpload as any, {
                cacheControl: "60",
                upsert: false,
            });
        if (uploadError && (uploadError as any).statusCode !== '409') {
            logger.error("Message media upload error:", uploadError);
            return routeData({ success: false, error: uploadError }, { headers });
        }
        if (campaignId) {
            const { data: campaign, error } = await supabase
                .from('message_campaign')
                .select('id, message_media')
                .eq('campaign_id', campaignId as number)
                .single();
            if (error) {
                logger.error('Campaign Error', error);
                return routeData({ success: false, error: error }, { headers });
            }
            const { data: campaignUpdate, error: updateError } = await supabase
                .from('message_campaign')
                .update({
                    message_media: [...((campaign?.message_media ?? []) as string[]), safeFileName]
                })
                .eq('campaign_id', campaignId as number)
                .select()
            if (updateError) {
                logger.error("Error updating campaign with media:", updateError);
                return routeData({ success: false, error: updateError }, { headers });
            }

            const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                .from("messageMedia")
                .createSignedUrl(`${workspaceId}/${safeFileName}`, 3600);

            if (signedUrlError) {
                logger.error("Error signing uploaded message media:", signedUrlError);
                return routeData({ success: false, error: signedUrlError }, { headers });
            }

            return routeData({
                success: true,
                error: null,
                campaignUpdate,
                uploadedFileName: safeFileName,
                url: signedUrlData.signedUrl,
            }, { headers });
        } else {
            const { data, error: imageError } = await supabase.storage.from('messageMedia').createSignedUrl(`${workspaceId}/${safeFileName}`, 3600);
            if (imageError) return routeData({ success: false, error: imageError }, { headers });
            return routeData({ success: true, error: null, url: data.signedUrl }, { headers });
        }
    } else if (method === "DELETE") {
        const campaignIdRaw = formData.get("campaignId");
        const campaignId = campaignIdRaw == null ? null : Number(campaignIdRaw);
        const mediaNameRaw = formData.get("fileName");
        const mediaName = typeof mediaNameRaw === 'string' ? mediaNameRaw : String(mediaNameRaw ?? '');
        const encodedMediaName = encodeURI(mediaName);
        const { data: campaign, error } = await supabase
            .from("message_campaign")
            .select("id, message_media")
            .eq("campaign_id", campaignId as number)
            .single();
        if (error) {
            logger.error("Campaign Error", error);
            return routeData({ success: false, error: error }, { headers });
        }

        const { data: campaignUpdate, error: updateError } = await supabase
            .from("message_campaign")
            .update({
                message_media: (campaign.message_media ?? []).filter(
                    (med) => med !== encodedMediaName,
                ),
            })
            .eq("campaign_id", campaignId as number)
            .select();

        if (updateError) {
            return routeData({ success: false, error: updateError }, { headers });
        }
        return routeData({ success: true, error: null, campaignUpdate, removedFileName: encodedMediaName }, { headers });
    }
    return routeData({ success: false, error: 'Method not allowed' }, { status: 405 });
}
