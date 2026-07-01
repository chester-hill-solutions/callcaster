import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireDualAuth } from "@/lib/api-auth.server";
import {
  findCampaignMessageMedia,
  updateCampaignMessageMedia,
} from "@/lib/campaign-ivr.server";
import { uploadObject, createSignedObjectUrl } from "@/lib/object-storage.server";

import type { ActionFunctionArgs } from "react-router";

function sanitizeFilename(filename: string) {
    const decodedFilename = decodeURIComponent(filename);
    const sanitized = decodedFilename.replace(/[^a-zA-Z0-9-_.]/g, '')
        .replace(/\s+/g, '_');

    const parts = sanitized.split('.');
    const ext = parts.pop();
    const name = parts.join('_');

    return `${name}.${ext}`;
}

export async function action({ request }: ActionFunctionArgs) {

    const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = await getSession(request);    const method = request.method;
    const formData = await request.formData();
    const workspaceId = formData.get('workspaceId')
    if (workspaceId == null) {
        return routeData(
            { success: false, error: "Workspace does not exist" },
            { headers },
        );
    }
    const workspaceIdStr = String(workspaceId);
    if (method === "POST") {
        const mediaToUpload = formData.get("image") as File | string | null;
        const mediaNameRaw = formData.get("fileName");
        const mediaName = typeof mediaNameRaw === 'string' ? mediaNameRaw : String(mediaNameRaw ?? '');
        const encodedMediaName = encodeURI(mediaName);
        const campaignIdRaw = formData.get("campaignId");
        const campaignId = campaignIdRaw == null ? null : Number(campaignIdRaw);
        const safeFileName = sanitizeFilename(encodedMediaName);

        try {
          await uploadObject("messageMedia", `${workspaceIdStr}/${safeFileName}`, mediaToUpload as any, {
            cacheControl: "60",
          });
        } catch (uploadError: any) {
          if (uploadError?.statusCode !== '409') {
            logger.error("Message media upload error:", uploadError);
            return routeData({ success: false, error: uploadError }, { headers });
          }
        }
        if (campaignId) {
            let campaignUpdate;
            try {
              const campaign = await findCampaignMessageMedia(workspaceIdStr, campaignId);
              if (!campaign) {
                return routeData({ success: false, error: "Campaign not found" }, { headers });
              }
              campaignUpdate = await updateCampaignMessageMedia(
                workspaceIdStr,
                campaignId,
                [...((campaign.message_media ?? []) as string[]), safeFileName],
              );
              if (!campaignUpdate) {
                return routeData({ success: false, error: "Failed to update campaign" }, { headers });
              }
            } catch (error) {
              logger.error("Error updating campaign with media:", error);
              return routeData({ success: false, error }, { headers });
            }

            try {
              const signedUrl = await createSignedObjectUrl("messageMedia", `${workspaceIdStr}/${safeFileName}`, 3600);
              return routeData({
                  success: true,
                  error: null,
                  campaignUpdate: [campaignUpdate],
                  uploadedFileName: safeFileName,
                  url: signedUrl,
              }, { headers });
            } catch (signedUrlError) {
                logger.error("Error signing uploaded message media:", signedUrlError);
                return routeData({ success: false, error: signedUrlError }, { headers });
            }
        } else {
            try {
              const signedUrl = await createSignedObjectUrl("messageMedia", `${workspaceIdStr}/${safeFileName}`, 3600);
              return routeData({ success: true, error: null, url: signedUrl }, { headers });
            } catch (imageError) {
              return routeData({ success: false, error: imageError }, { headers });
            }
        }
    } else if (method === "DELETE") {
        const campaignIdRaw = formData.get("campaignId");
        const campaignId = campaignIdRaw == null ? null : Number(campaignIdRaw);
        const mediaNameRaw = formData.get("fileName");
        const mediaName = typeof mediaNameRaw === 'string' ? mediaNameRaw : String(mediaNameRaw ?? '');
        const encodedMediaName = encodeURI(mediaName);
        try {
          if (!campaignId) {
            return routeData({ success: false, error: "Campaign not found" }, { headers });
          }
          const campaign = await findCampaignMessageMedia(workspaceIdStr, campaignId);
          if (!campaign) {
            logger.error("Campaign Error", new Error("Campaign not found"));
            return routeData({ success: false, error: "Campaign not found" }, { headers });
          }

          const campaignUpdate = await updateCampaignMessageMedia(
            workspaceIdStr,
            campaignId,
            (campaign.message_media ?? []).filter(
              (med) => med !== encodedMediaName,
            ),
          );
          if (!campaignUpdate) {
            return routeData({ success: false, error: "Failed to update campaign" }, { headers });
          }
          return routeData({
            success: true,
            error: null,
            campaignUpdate: [campaignUpdate],
            removedFileName: encodedMediaName,
          }, { headers });
        } catch (error) {
          logger.error("Campaign Error", error);
          return routeData({ success: false, error }, { headers });
        }
    }
    return routeData({ success: false, error: 'Method not allowed' }, { status: 405 });
}
