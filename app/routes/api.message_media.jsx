import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import { json } from "@remix-run/node";

export async function action({ request, params }) {
    const { supabaseClient, headers, serverSession } =
        await getSupabaseServerClientWithSession(request);
    const formData = await request.formData();
    const workspaceId = formData.get('workspaceId')
    if (workspaceId == null) {
        return json(
            { success: false, error: "Workspace does not exist" },
            { headers },
        );
    }
    const mediaToUpload = formData.get("image");
    const mediaName = formData.get("fileName");
    const encodedMediaName = encodeURI(mediaName);
    const campaignId = formData.get("campaignId");
    const {  error: uploadError } = await supabaseClient.storage
        .from("messageMedia")
        .upload(`${workspaceId}/${encodedMediaName}`, mediaToUpload, {
            cacheControl: "60",
            upsert: false,
        });

    if (uploadError) {
        console.log({uploadError})
        return json({ success: false, error: uploadError }, { headers });
    }
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
            message_media: [...campaign.message_media, encodedMediaName]
        })
        .eq('campaign_id', campaignId)
        .select()
    if (updateError) {
        console.log(updateError)
        return json({ success: false, error: updateError }, { headers });
    }

    return json({ success: true, error: null, campaignUpdate }, { headers });
}
