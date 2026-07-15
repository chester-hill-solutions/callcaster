import { updateCampaignVoicedropAudio } from "@/lib/campaign-ivr.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { uploadObject, createSignedObjectUrl } from "@/lib/object-storage.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: async ({ request }) => {
    const auth = await requireDualAuth(request);
    if (auth instanceof Response) return auth;
    const user = getDualAuthUser(auth);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return { user };
  },
  sideEffects: ["db-write", "external"],
  handler: async ({ request, auth }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const live_campaign_id_raw = formData.get('live_campaign_id');
    const live_campaign_id = live_campaign_id_raw == null ? null : Number(live_campaign_id_raw);
    const workspace_id = formData.get('workspace_id');
    const campaignName = formData.get('campaign_name') as string || Date.now().toString();
    try {
        if (live_campaign_id == null || typeof workspace_id !== "string" || !workspace_id) {
          throw new Error("Campaign and workspace are required");
        }
        await requireWorkspaceAccess({
          user: auth.user,
          workspaceId: workspace_id,
        });
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = `${auth.user.id}.${campaignName}`;
        await uploadObject("audio", fileName, buffer, {
          contentType: file.type,
        });
        const signedUrl = await createSignedObjectUrl("audio", fileName, 3600);
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
  },
});
