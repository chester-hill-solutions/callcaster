import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import { createWorkspaceTwilioInstance, getWorkspaceUsers } from '../lib/database.server';

export const loader = async ({ request }) => {
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const url = new URL(request.url);
    const params = url.searchParams;
    const areaCode = params.get('areaCode')
    try {
        const locals = await twilio.availablePhoneNumbers('CA').local.list({
            areaCode,
            limit: 10
        })
        return new Response(JSON.stringify(locals), {
            headers: {
                "Content-Type": "application/json"
            },
            status: 200
        })

    } catch (error) {
        console.error('Fetching numbers failed', error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 500
        });
    }
}

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const formData = await request.formData();
    const { phoneNumber, workspace_id } = Object.fromEntries(formData);
    try {
        const { data: users, error } = await getWorkspaceUsers({
            supabaseClient: supabase,
            workspaceId: workspace_id,
        });
        if (error) throw error;
        const owner = users.find((user) => user.user_workspace_role === "owner");
        const {data: workspaceCredits, error: workspaceCreditsError} = await supabase.from('workspace').select('credits').eq('id', workspace_id).single();
        if (workspaceCreditsError) throw workspaceCreditsError;
        const credits = workspaceCredits.credits;
        if (credits <= 1000) {
            return new Response(JSON.stringify({ creditsError: true }), {
                headers: {
                    "Content-Type": "application/json"
                },
                status: 400
            })
        }
        const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id });
        const number = await twilio.incomingPhoneNumbers.create({
            phoneNumber,
            statusCallback: `${process.env.BASE_URL}/api/caller-id/status`,
            statusCallbackMethod:"POST",
            voiceUrl: `${process.env.BASE_URL}/api/inbound`,
            smsUrl: `${process.env.BASE_URL}/api/inbound-sms`
        }).catch((error) => {
            console.error(error);
            throw error;
        });
        const { data: newNumber, error: newNumberError } = await supabase
            .from('workspace_number')
            .insert({
                workspace: workspace_id,
                friendly_name: number.friendlyName,
                phone_number: number.phoneNumber,
                capabilities: {verification_status:((number.capabilities.mms && number.capabilities.sms && number.capabilities.voice) ? "success" : "pending") , ...number.capabilities},
                inbound_action: owner.username,
                type: "rented"
            })
            .select().single();
        if (newNumberError) throw newNumberError;
        const { error: updateError } = await supabase.from('transaction_history').insert({
            workspace: workspace_id,
            amount: -1000,
            type: "DEBIT",
            note: "Rented number - " + number.friendlyName
        });
        if (updateError) throw updateError;
        return new Response(JSON.stringify({ newNumber }), {
            headers: {
                "Content-Type": "application/json"
            },
            status: 201
        })
    } catch (error) {
        console.error('Failed to register number', error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 500
        });

    }
}