import { json } from "@remix-run/node";
import { verifyAuth } from "~/lib/supabase.server";
import type { ActionFunctionArgs } from "@remix-run/node";

interface OutreachAttemptRequest {
  campaign_id: number | string;
  contact_id: number | string;
  queue_id: number | string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const { supabaseClient: supabase, headers, user } = await verifyAuth(request);
    const { campaign_id, contact_id, queue_id }: OutreachAttemptRequest = await request.json();

    const { data, error } = await supabase.rpc('create_outreach_attempt', {
      con_id: Number(contact_id),
      cam_id: Number(campaign_id),
      usr_id: user?.id ?? '',
      wks_id: '',
      queue_id: Number(queue_id)
    });
    if (error) return json({ error })
    return json(data,{headers})
}
