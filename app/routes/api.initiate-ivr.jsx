import { createSupabaseServerClient } from "../lib/supabase.server";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export const action = async ({ request, params }) => {
    const { campaign_id, user_id } = await request.json()

    const { supabaseClient: supabase } = createSupabaseServerClient(request);
    const { data, error } = await supabase
        .from('campaign_queue')
        .select(
            `
        queue_id:id,
        ...contact(contact_id:id, phone),
        ...campaign(caller_id),
        workplace
    )
    `,
        ).eq('campaign_id', campaign_id).eq('attempts', 0);
    for (let i = 0; i < data.length; i++) {
        let contact = data[i];
        await fetch('https://callcaster.ca/api/ivr', {
            body: JSON.stringify({ to_number: contact.phone, user_id: user_id, campaign_id: campaign_id, workspace_id: contact.workspace, queue_id: contact.queue_id, contact_id: contact.contact_id, caller_id: contact.caller_id }),
            headers: {
                "Content-Type": "application/json"
            },
            method: "POST",
        }).catch((e) => console.log(e))
    }
    return (data)
}