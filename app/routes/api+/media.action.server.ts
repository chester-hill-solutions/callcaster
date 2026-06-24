import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { getDualAuthSupabase, getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const live_campaign_id_raw = formData.get('live_campaign_id');
    const live_campaign_id = live_campaign_id_raw == null ? null : Number(live_campaign_id_raw);
    const campaignName = formData.get('campaign_name') as string || Date.now().toString();
    const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const supabase = getDualAuthSupabase(auth);
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
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
        const { data: publicUrlData } = await supabase.storage.from('audio').getPublicUrl(data.path);
        const { error: updateError } = await supabase.from('live_campaign').update({ voicedrop_audio: publicUrlData.publicUrl }).eq('campaign_id', live_campaign_id as number);
        if (updateError) throw updateError;
        return routeData(publicUrlData.publicUrl, { status: 201 });
    }
    catch (error) {
        logger.error("Error uploading media:", error);
        return routeData({ error }, { status: 500 });
    }
}
