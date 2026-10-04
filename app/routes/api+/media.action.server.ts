import { randomUUID } from "node:crypto";
import { updateCampaignVoicedropAudio } from "@/lib/campaign-ivr.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { uploadObject, createSignedObjectUrl } from "@/lib/object-storage.server";
import { MAX_MEDIA_BODY_BYTES, validateMediaFile } from "@/lib/media-upload.server";
import { FormBodyError, readBoundedFormData } from "@/lib/bounded-form-data.server";
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
    let formData: FormData;
    try {
      formData = await readBoundedFormData(request, MAX_MEDIA_BODY_BYTES);
    } catch (error) {
      if (!(error instanceof FormBodyError)) throw error;
      return routeData({ error: error.message }, { status: error.status });
    }
    const file = formData.get('file');
    const live_campaign_id_raw = formData.get('live_campaign_id');
    const live_campaign_id = live_campaign_id_raw == null ? null : Number(live_campaign_id_raw);
    const workspace_id = formData.get('workspace_id');
    try {
        if (live_campaign_id == null || typeof workspace_id !== "string" || !workspace_id) {
          throw new Error("Campaign and workspace are required");
        }
        await requireWorkspaceAccess({
          user: auth.user,
          workspaceId: workspace_id,
        });
        const validation = validateMediaFile(file, "audio");
        if (!validation.ok) {
          return routeData({ error: validation.error }, {
            status: validation.status,
          });
        }
        const arrayBuffer = await validation.file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = `${randomUUID()}-${validation.safeName}`;
        await uploadObject("audio", fileName, buffer, {
          contentType: validation.file.type,
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
