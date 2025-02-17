import { verifyAuth } from '../lib/supabase.server';
import { json } from '@remix-run/react';

export const action = async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file');
    const live_campaign_id = formData.get('live_campaign_id');
    const campaignName = formData.get('campaign_name') || Date.now();
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
        const { data: { publicUrl }, error: urlError } = await supabase.storage.from('audio').getPublicUrl(data.path);
        if (urlError) throw urlError;
        const { error: updateError } = await supabase.from('live_campaign').update({ voicemail: publicUrl }).eq('campaign_id', live_campaign_id);
        if (updateError) throw updateError;
        return json(publicUrl, { status: 201 });
    }
    catch (error) {
        console.log(error)
        return json({ error }, { status: 500 });
    }
};