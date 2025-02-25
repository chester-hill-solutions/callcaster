import { verifyAuth } from '../lib/supabase.server';
import { normalizePhoneNumber } from '../lib/utils';

export const action = async ({ request, params }) => {
    const { campaign_id, user_id, workspace_id } = await request.json()
    const { supabaseClient: supabase } = await verifyAuth(request);
    const { data, error } = await supabase
        .rpc('get_campaign_queue', { campaign_id_pro: campaign_id })
    if (error) throw error;
    console.log(data)
    for (let i = 0; i < data?.length; i++) {
        let contact = data[i];
        const formData = new FormData();
        formData.append('user_id', user_id.id);
        formData.append('campaign_id', Number(campaign_id)  );
        formData.append('workspace_id', workspace_id);
        formData.append('queue_id', contact.id);
        formData.append('contact_id', contact.contact_id);
        formData.append('caller_id', contact.caller_id);
        formData.append('to_number', normalizePhoneNumber(contact.phone));
        const res = await fetch(`${process.env.BASE_URL}/api/ivr`, {
            body: formData,
            method: "POST",
        }).then(e => e.json()).catch((e) => console.log(e))
        if (res.creditsError) {
            return {
                creditsError: true,
            }
        }
    }
    return data;
}
