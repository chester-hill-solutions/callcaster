import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import { json } from "@remix-run/node";

function sanitizeFilename(filename) {
    const decodedFilename = decodeURIComponent(filename);
    const sanitized = decodedFilename.replace(/[^a-zA-Z0-9-_\.]/g, '')
        .replace(/\s+/g, '_');

    const parts = sanitized.split('.');
    const ext = parts.pop();
    const name = parts.join('_');

    return `${name}.${ext}`;
}

export async function action({ request, params }) {

    const { supabaseClient, headers, serverSession } =
        await getSupabaseServerClientWithSession(request);
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
        const mediaToUpload = formData.get("image");
        const mediaName = formData.get("fileName");
        const encodedMediaName = encodeURI(mediaName);
        const campaignId = formData.get("campaignId");
        const safeFileName = sanitizeFilename(encodedMediaName);

        const { error: uploadError } = await supabaseClient.storage
            .from("messageMedia")
            .upload(`${workspaceId}/${safeFileName}`, mediaToUpload, {
                cacheControl: "60",
                upsert: false,
            });
        if (uploadError && uploadError.statusCode !== '409') {
            console.log({ uploadError })
            return json({ success: false, error: uploadError }, { headers });
        }
        if (campaignId) {
            const { data: campaign, error } = await supabaseClient
                .from('message_campaign')
                .select('id, message_media')
                .eq('campaign_id', campaignId)
                .single();
            if (error) {
                console.log('Campaign Error', error);
                return json({ success: false, error: error }, { headers });
            }
            const { data: campaignUpdate, error: updateError } = await supabaseClient
                .from('message_campaign')
                .update({
                    message_media: [...(campaign.message_media || []), safeFileName]
                })
                .eq('campaign_id', campaignId)
                .select()
            if (updateError) {
                console.log(updateError)
                return json({ success: false, error: updateError }, { headers });
            }

            return json({ success: true, error: null, campaignUpdate }, { headers });
        } else {
            const { data, error: imageError } = await supabaseClient.storage.from('messageMedia').createSignedUrl(`${workspaceId}/${safeFileName}`, 3600);
            if (imageError) return json({ success: false, error: imageError }, { headers });
            return json({ success: true, error: null, url: data.signedUrl }, { headers });
        }
    } else if (method === "DELETE") {
        const campaignId = formData.get("campaignId");
        const mediaName = formData.get("fileName");
        const encodedMediaName = encodeURI(mediaName);
        const { data: campaign, error } = await supabaseClient
            .from("message_campaign")
            .select("id, message_media")
            .eq("campaign_id", campaignId)
            .single();
        if (error) {
            console.log("Campaign Error", error);
            return json({ success: false, error: error }, { headers });
        }

        const { data: campaignUpdate, error: updateError } = await supabaseClient
            .from("message_campaign")
            .update({
                message_media: campaign.message_media.filter(
                    (med) => med !== encodedMediaName,
                ),
            })
            .eq("campaign_id", campaignId)
            .select();

        if (updateError) {
            return json({ success: false, error: updateError }, { headers });
        }
        return json({ success: false, error: updateError }, { headers });
    }
}