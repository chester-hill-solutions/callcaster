import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireDualAuth, getDualAuthUser } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import {
  countOtherCampaignsReferencingMedia,
  findCampaignMessageMedia,
  updateCampaignMessageMedia,
} from "@/lib/campaign-ivr.server";
import { uploadObject, createSignedObjectUrl, deleteObject, ObjectExistsError } from "@/lib/object-storage.server";
import { AppError } from "@/lib/errors.server";
import { MAX_MEDIA_BODY_BYTES, sanitizeFilename, validateMediaFile } from "@/lib/media-upload.server";
import { FormBodyError, readBoundedFormData } from "@/lib/bounded-form-data.server";
import { defineAction } from "@/lib/handler.server";

async function resolveWorkspaceAuth(
  auth: Awaited<ReturnType<typeof requireDualAuth>>,
  workspaceId: string,
) {
  if (auth instanceof Response) {
    return auth;
  }
  if (auth.authType === "api_key") {
    if (auth.workspaceId !== workspaceId) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 403 });
    }
    return null;
  }
  const user = getDualAuthUser(auth);
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401 });
  }
  try {
    await requireWorkspaceAccess({ user, workspaceId });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof AppError ? error.message : "Internal server error";
    return new Response(JSON.stringify({ success: false, error: message }), { status: statusCode });
  }
  return null;
}

export const action = defineAction({
  auth: ({ request }) => requireDualAuth(request),
  sideEffects: ["db-write", "external"],
  handler: async ({ request, auth }) => {
  const { headers } = await getSession(request);
  const method = request.method;
  let formData: FormData;
  try {
    formData = await readBoundedFormData(request, MAX_MEDIA_BODY_BYTES);
  } catch (error) {
    if (!(error instanceof FormBodyError)) throw error;
    return routeData({ success: false, error: error.message }, { status: error.status, headers });
  }
  const workspaceId = formData.get("workspaceId");
  if (workspaceId == null || typeof workspaceId !== "string" || !workspaceId.trim()) {
    return routeData(
      { success: false, error: "Workspace does not exist" },
      { headers },
    );
  }
  const workspaceIdStr = workspaceId.trim();

  const authError = await resolveWorkspaceAuth(auth, workspaceIdStr);
  if (authError) {
    return authError;
  }

  if (method === "POST") {
    const mediaToUpload = formData.get("image");
    const mediaNameRaw = formData.get("fileName");
    const mediaName = typeof mediaNameRaw === "string" ? mediaNameRaw : "";
    const campaignIdRaw = formData.get("campaignId");
    const campaignId = campaignIdRaw == null ? null : Number(campaignIdRaw);

    const fileValidation = validateMediaFile(mediaToUpload);
    if (!fileValidation.ok) {
      return routeData({ success: false, error: fileValidation.error }, { headers });
    }
    const uploadedFileName = `${randomUUID()}-${fileValidation.safeName}`;

    if (campaignId !== null && Number.isNaN(campaignId)) {
      return routeData({ success: false, error: "Invalid campaign ID" }, { headers });
    }

    if (campaignId) {
      try {
        const campaign = await findCampaignMessageMedia(workspaceIdStr, campaignId);
        if (!campaign) {
          return routeData({ success: false, error: "Campaign not found" }, { headers });
        }
      } catch (error) {
        return routeData({ success: false, error }, { headers });
      }
    }

    try {
      await uploadObject("messageMedia", `${workspaceIdStr}/${uploadedFileName}`, fileValidation.file, {
        upsert: false,
        cacheControl: "60",
        contentType: fileValidation.file.type || undefined,
      });
    } catch (uploadError) {
      if (uploadError instanceof ObjectExistsError) {
        return routeData(
          { success: false, error: "Media upload conflict. Please try again." },
          { status: 409, headers },
        );
      }
      logger.error("Message media upload error:", uploadError);
      return routeData({ success: false, error: uploadError }, { headers });
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
          [...((campaign.message_media ?? []) as string[]), uploadedFileName],
        );
        if (!campaignUpdate) {
          return routeData({ success: false, error: "Failed to update campaign" }, { headers });
        }
      } catch (error) {
        logger.error("Error updating campaign with media:", error);
        return routeData({ success: false, error }, { headers });
      }

      try {
        const signedUrl = await createSignedObjectUrl("messageMedia", `${workspaceIdStr}/${uploadedFileName}`, 3600);
        return routeData({
          success: true,
          error: null,
          campaignUpdate: [campaignUpdate],
          uploadedFileName,
          url: signedUrl,
        }, { headers });
      } catch (signedUrlError) {
        logger.error("Error signing uploaded message media:", signedUrlError);
        return routeData({ success: false, error: signedUrlError }, { headers });
      }
    }

    try {
      const signedUrl = await createSignedObjectUrl("messageMedia", `${workspaceIdStr}/${uploadedFileName}`, 3600);
      return routeData({ success: true, error: null, url: signedUrl }, { headers });
    } catch (imageError) {
      return routeData({ success: false, error: imageError }, { headers });
    }
  } else if (method === "DELETE") {
    const campaignIdRaw = formData.get("campaignId");
    const campaignId = campaignIdRaw == null ? null : Number(campaignIdRaw);
    const mediaNameRaw = formData.get("fileName");
    const mediaName = typeof mediaNameRaw === "string" ? mediaNameRaw : "";

    if (campaignId === null || Number.isNaN(campaignId)) {
      return routeData({ success: false, error: "Campaign not found" }, { headers });
    }

    const safeFileName = sanitizeFilename(mediaName);
    if (!safeFileName) {
      return routeData({ success: false, error: "Invalid filename" }, { headers });
    }

    try {
      const campaign = await findCampaignMessageMedia(workspaceIdStr, campaignId);
      if (!campaign) {
        logger.error("Campaign Error", new Error("Campaign not found"));
        return routeData({ success: false, error: "Campaign not found" }, { headers });
      }

      const campaignUpdate = await updateCampaignMessageMedia(
        workspaceIdStr,
        campaignId,
        (campaign.message_media ?? []).filter(
          (med) => med !== safeFileName,
        ),
      );
      if (!campaignUpdate) {
        return routeData({ success: false, error: "Failed to update campaign" }, { headers });
      }

      // Only the last referrer may destroy the object; another campaign that
      // attached the same file would otherwise sign URLs to nothing.
      const otherReferences = await countOtherCampaignsReferencingMedia(
        workspaceIdStr,
        safeFileName,
        campaignId,
      );
      const objectDeleted = otherReferences === 0;
      if (objectDeleted) {
        await deleteObject("messageMedia", `${workspaceIdStr}/${safeFileName}`);
      }

      return routeData({
        success: true,
        error: null,
        campaignUpdate: [campaignUpdate],
        removedFileName: safeFileName,
        objectDeleted,
      }, { headers });
    } catch (error) {
      logger.error("Campaign Error", error);
      return routeData({ success: false, error }, { headers });
    }
  }
  return routeData({ success: false, error: "Method not allowed" }, { status: 405 });
  },
});
