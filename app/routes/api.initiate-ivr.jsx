import { getSupabaseServerClientWithSession } from '../lib/supabase.server';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export const action = async ({ request, params }) => {
    const { campaign_id, user_id } = await request.json()

    const {supabaseClient: supabase} = await getSupabaseServerClientWithSession(request);
    const { data, error } = await supabase
    .rpc('get_campaign_queue', { campaign_id_pro: campaign_id })
    for (let i = 0; i < data?.length ; i++) {
        let contact = data[i];
        await fetch(`${process.env.BASE_URL}/api/ivr`, {
            body: JSON.stringify({ to_number: contact.phone, user_id: user_id.id, campaign_id: campaign_id, workspace_id: contact.workspace, queue_id: contact.id, contact_id: contact.id, caller_id: contact.caller_id }),
            headers: {
                "Content-Type": "application/json"
            },
            method: "POST",
        }).catch((e) => console.log(e))
    }
    return (data)
}