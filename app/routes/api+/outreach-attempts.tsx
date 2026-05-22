
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";


interface OutreachAttemptRequest {
  campaign_id: number | string;
  contact_id: number | string;
  queue_id: number | string;
}

export const action = async ({ request }: ActionFunctionArgs) => {  const { verifyAuth } = await import("@/lib/supabase.server");
  const { safeParseJson } = await import("@/lib/database.server");

    const { supabaseClient: supabase, headers, user } = await verifyAuth(request);
    const { campaign_id, contact_id, queue_id }: OutreachAttemptRequest = await safeParseJson(request);

    const { data, error } = await supabase.rpc('create_outreach_attempt', {
      con_id: Number(contact_id),
      cam_id: Number(campaign_id),
      usr_id: user?.id ?? '',
      wks_id: '',
      queue_id: Number(queue_id)
    });
    if (error) return routeData({ error })
    return routeData(data,{headers})
}
