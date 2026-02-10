import { json } from "@remix-run/node";
import { createClient } from '@supabase/supabase-js';
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database, TablesInsert } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";
import { env } from "@/lib/env.server";
import { validateTwilioWebhookParams } from "@/twilio.server";

function toUnderCase(str: string): string {
    return str.replace(/(?!^)([A-Z])/g, '_$1').toLowerCase();
}

function convertKeysToUnderCase(obj: Record<string, unknown>): Record<string, unknown> {
    const newObj: Record<string, unknown> = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            newObj[toUnderCase(key)] = obj[key];
        }
    }
    return newObj;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const formData = await request.formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const callSidRaw = params.CallSid ?? params.call_sid;
    const supabase = createClient<Database>(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
    const { data: existingCall } = await supabase.from("call").select("workspace").eq("sid", callSidRaw).single();
    let authToken = env.TWILIO_AUTH_TOKEN();
    if (existingCall?.workspace) {
      const { data: ws } = await supabase.from("workspace").select("twilio_data").eq("id", existingCall.workspace).single();
      if (ws?.twilio_data?.authToken) authToken = ws.twilio_data.authToken;
    }
    const signature = request.headers.get("x-twilio-signature");
    const url = new URL(request.url).href;
    if (!validateTwilioWebhookParams(params, signature, url, authToken)) {
      return json({ error: "Invalid Twilio signature" }, { status: 403 });
    }
    const calledVia = params.CalledVia ?? params.called_via;
    const userId = calledVia ? calledVia.split(":")[1] : '';
    const realtime = supabase.realtime.channel(userId || 'default');
    const parsedBody: Record<string, unknown> = params;
    const underCaseData = convertKeysToUnderCase(parsedBody);

    const getString = (v: unknown): string | null => {
      if (typeof v === 'string') return v;
      return v == null ? null : String(v);
    };
    const getNumber = (v: unknown): number | null => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const updateData: TablesInsert<'call'> = {
        sid: getString(underCaseData['call_sid']) ?? '',
        date_created: getString(underCaseData['timestamp']) ?? new Date().toISOString(),
        date_updated: new Date().toISOString(),
        parent_call_sid: getString(underCaseData['parent_call_sid']),
        account_sid: getString(underCaseData['account_sid']),
        to: getString(underCaseData['to']),
        from: getString(underCaseData['from']),
        status: (getString(underCaseData['call_status']) ?? getString(underCaseData['status'])) as Database['public']['Enums']['call_status'] | null,
        start_time: getString(underCaseData['start_time']),
        end_time: getString(underCaseData['end_time']),
        duration: String(Math.max(getNumber(underCaseData['duration']) ?? 0, getNumber(underCaseData['call_duration']) ?? 0)),
        direction: getString(underCaseData['direction']),
        api_version: getString(underCaseData['api_version']),
        forwarded_from: getString(underCaseData['forwarded_from']),
        caller_name: getString(underCaseData['caller_name']),
        price: getString(underCaseData['price']),
        campaign_id: getNumber(underCaseData['campaign_id']),
        contact_id: getNumber(underCaseData['contact_id']),
        call_duration: getNumber(underCaseData['call_duration']),
        recording_duration: getString(underCaseData['recording_duration']),
        recording_sid: getString(underCaseData['recording_sid']),
        recording_url: getString(underCaseData['recording_url']),
    };
    const { data, error } = await supabase.from('call').upsert([updateData], { onConflict: 'sid' }).select();
    if (error) {
        logger.error('Error updating call:', error);
        return json({ success: false, error: 'Failed to update call' }, { status: 500 });
    }
    const { data: currentAttempt, error: fetchError } = await supabase
        .from('outreach_attempt')
        .select('disposition, contact_id, workspace')
        .eq('id', data?.[0]?.outreach_attempt_id as number)
        .single();
    if (fetchError) {
        logger.error('Error fetching current attempt:', fetchError);
        return json({ success: false, error: 'Failed to fetch current attempt' }, { status: 500 });
    }
    realtime.send({
        type: "broadcast", event: "message", payload: {
            contact_id: currentAttempt.contact_id,
            status: underCaseData['call_status']
        }
    });
    
    if (["initiated", "ringing", "in-progress", "idle"].includes(String(underCaseData['call_status']))) {
        const { error: updateError } = await supabase
            .from('outreach_attempt')
            .update({ disposition: underCaseData['call_status'] as string })
            .eq('id', data?.[0]?.outreach_attempt_id as number)
            .select();

        if (updateError) {
            logger.error('Error updating attempt:', updateError);
            return json({ success: false, error: 'Failed to update attempt' }, { status: 500 });
        }
    }
    const onePerSixty = (duration: number): number => {
        return Math.floor(duration / 60) + 1;
    }
    if (["completed", "failed", "no-answer", "busy"].includes(String(underCaseData['call_status']))) {
        const billingUnits = onePerSixty(Math.max(getNumber(underCaseData['duration']) ?? 0, getNumber(underCaseData['call_duration']) ?? 0));
        const { data: transaction, error: transactionError } = await supabase.from('transaction_history').insert({
            workspace: currentAttempt.workspace,
            type: "DEBIT",
            amount: -billingUnits,
            note: `Call ${updateData.sid}, Contact ${currentAttempt.contact_id}, Outreach Attempt ${data?.[0]?.outreach_attempt_id}`
        }).select();
        if (transactionError) {
            logger.error('Error creating transaction:', transactionError);
            return json({ success: false, error: 'Failed to create transaction' }, { status: 500 });
        }
        logger.debug("Transaction created:", transaction)
    }
    return json({ success: true })
}