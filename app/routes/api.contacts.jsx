import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers } = await getSupabaseServerClientWithSession(request);

    const method = request.method;
    const contentType = request.headers.get("Content-Type");

    let response;

    if (method === 'PATCH' && contentType === 'application/json') {
        const data = await request.json();
        const { data: update, error } = await supabaseClient
            .from('contact')
            .update(data)
            .eq('id', data.id)
            .select();

        if (error) {
            console.error(error);
            return json({ error: 'Failed to update contact' }, { status: 500 });
        }

        response = update;
    } else
        if (method === 'POST' && contentType.startsWith('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            const audience_id = formData.get('audience_id');
            const workspace = formData.get('workspace');
            const [firstname, surname] = formData.get('name')?.split(" ") || ["", ""];
            const phone = formData.get('phone');
            const email = formData.get('email');
            const address = formData.get('address');

            const { data: insert, error } = await supabaseClient
                .from('contact')
                .insert({ workspace, firstname, surname, phone, email, address })
                .select();

            if (error) {
                console.error('Failed to create contact', error);
                return json({ error: 'Failed to create contact' }, { status: 500 });
            }

            if (audience_id && insert) {
                const contactAudienceData = insert.map(contact => ({ contact_id: contact.id, audience_id }));
                const { data: contactAudienceInsert, error: contactAudienceError } = await supabaseClient
                    .from('contact_audience')
                    .insert(contactAudienceData)
                    .select();

                if (contactAudienceError) {
                    console.error('Failed to associate contact with audience',contactAudienceError);
                    return json({ error: 'Failed to associate contact with audience' }, { status: 500 });
                }
            }

            response = insert;
        } else
            if (method === 'POST' && contentType.startsWith('application/json')) {
                const data = await request.json()
                const contacts = data.contacts.map((contact) => ({
                    ...contact,
                    workspace: data.workspace_id,
                }));
                const { data: insert, error } = await supabaseClient.from('contact').insert(contacts).select();
                if (error) {
                    console.error(error);
                    return json({ error: 'Failed to upload contacts' }, { status: 500 })
                }
                const audienceMap = insert.map((contact) => (
                    {
                        contact_id: contact.id,
                        audience_id: data.audience_id
                    }
                ));
                const { data: audience_insert, error: audience_insert_error } = await supabaseClient.from('contact_audience').insert(audienceMap).select();
                if (audience_insert_error) {
                    console.error(error);
                    return json({ error: 'Failed to associate contact with audience' }, { status: 500 });
                }
                response = { insert, audience_insert };
            }
            else {
                return json({ error: 'Unsupported request method or content type' }, { status: 400 });
            }

    return json(response);
};
