import { verifyAuth } from '../lib/supabase.server';
import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const live_campaign_id_raw = formData.get('live_campaign_id');
    const live_campaign_id = live_campaign_id_raw == null ? null : Number(live_campaign_id_raw);
    const campaignName = formData.get('campaign_name') as string || Date.now().toString();
    const { supabaseClient: supabase, user } = await verifyAuth(request);
    const arrayBuffer = await file.arrayBuffer();   
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `${user.id}.${campaignName}`;
    try {
        const { data, error } = await supabase.storage
            .from('audio')
            .upload(fileName, buffer, {
                upsert: true,
                contentType: file.type,
            });
        if (error) throw error;
        const { data: publicUrlData } = await supabase.storage.from('audio').getPublicUrl(data.path);
        const { error: updateError } = await supabase.from('live_campaign').update({ voicedrop_audio: publicUrlData.publicUrl }).eq('campaign_id', live_campaign_id as number);
        if (updateError) throw updateError;
        return json(publicUrlData.publicUrl, { status: 201 });
    }
    catch (error) {
        console.log(error)
        return json({ error }, { status: 500 });
    }
};