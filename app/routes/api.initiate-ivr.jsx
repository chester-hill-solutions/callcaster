import { getSupabaseServerClientWithSession } from '../lib/supabase.server';

export const action = async ({ request, params }) => {
    const { campaign_id, user_id, workspace_id } = await request.json()
    const { supabaseClient: supabase } = await getSupabaseServerClientWithSession(request);
    const { data, error } = await supabase
        .rpc('get_campaign_queue', { campaign_id_pro: campaign_id })

    for (let i = 0; i < data?.length; i++) {
        let contact = data[i];
        const formData = new FormData();
        formData.append('to_number', contact.phone);
        formData.append('user_id', user_id.id);
        formData.append('campaign_id', campaign_id);
        formData.append('workspace_id', workspace_id);
        formData.append('queue_id', contact.id);
        formData.append('contact_id', contact.contact_id);
        formData.append('caller_id', contact.caller_id);
        await fetch(`${process.env.BASE_URL}/api/ivr`, {
            body: formData,
            method: "POST",
        }).catch((e) => console.log(e))
    }
    return data;
}
