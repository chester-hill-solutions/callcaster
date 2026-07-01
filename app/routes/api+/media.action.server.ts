import { updateCampaignVoicedropAudio } from "@/lib/campaign-ivr.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { uploadObject, createSignedObjectUrl } from "@/lib/object-storage.server";

import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const live_campaign_id_raw = formData.get('live_campaign_id');
    const live_campaign_id = live_campaign_id_raw == null ? null : Number(live_campaign_id_raw);
    const workspace_id = formData.get('workspace_id');
    const campaignName = formData.get('campaign_name') as string || Date.now().toString();
    const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
    const arrayBuffer = await file.arrayBuffer();   
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `${user.id}.${campaignName}`;
    try {
        await uploadObject("audio", fileName, buffer, {
          contentType: file.type,
        });
        const signedUrl = await createSignedObjectUrl("audio", fileName, 3600);
        if (live_campaign_id == null || typeof workspace_id !== "string" || !workspace_id) {
          throw new Error("Campaign and workspace are required");
        }
        const updated = await updateCampaignVoicedropAudio(
          workspace_id,
          live_campaign_id,
          signedUrl,
        );
        if (!updated) {
          throw new Error("Campaign not found");
        }
        return routeData(signedUrl, { status: 201 });
    }
    catch (error) {
        logger.error("Error uploading media:", error);
        return routeData({ error }, { status: 500 });
    }
}
