import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireDualAuth, getDualAuthUser } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import {
  findCampaignMessageMedia,
  updateCampaignMessageMedia,
} from "@/lib/campaign-ivr.server";
import { uploadObject, createSignedObjectUrl, deleteObject } from "@/lib/object-storage.server";
import { AppError } from "@/lib/errors.server";

import type { ActionFunctionArgs } from "react-router";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/flac",
]);

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "tiff",
  "mp3",
  "wav",
  "ogg",
  "aac",
  "m4a",
  "mp4",
  "flac",
]);

function sanitizeFilename(filename: string) {
  const decoded = decodeURIComponent(filename);
  const sanitized = decoded
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/[^a-zA-Z0-9-_.]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const parts = sanitized.split(".");
  const ext = parts.pop()?.toLowerCase();
  const name = parts.join("_").replace(/\.+$/g, "");
  if (!ext || !name) {
    return null;
  }
  return `${name}.${ext}`;
}

function validateMediaFile(file: unknown): { ok: false; error: string } | { ok: true; safeName: string } {
  if (!(file instanceof File)) {
    return { ok: false, error: "Invalid file upload" };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "File exceeds 10MB limit" };
  }
  const fileName = file.name;
  const safeName = sanitizeFilename(fileName);
  if (!safeName) {
    return { ok: false, error: "Invalid filename" };
  }
  const ext = safeName.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: "Invalid file extension" };
  }
  const type = file.type || "";
  if (type && type !== "application/octet-stream" && !ALLOWED_MEDIA_TYPES.has(type)) {
    return { ok: false, error: "Invalid file type" };
  }
  return { ok: true, safeName };
}

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

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = await getSession(request);
  const method = request.method;
  const formData = await request.formData();
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
    const safeFileName = fileValidation.safeName;

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
      await uploadObject("messageMedia", `${workspaceIdStr}/${safeFileName}`, mediaToUpload as File, {
        cacheControl: "60",
        contentType: (mediaToUpload as File).type || undefined,
      });
    } catch (uploadError: any) {
      if (uploadError?.statusCode !== "409") {
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
    }

    try {
      const signedUrl = await createSignedObjectUrl("messageMedia", `${workspaceIdStr}/${safeFileName}`, 3600);
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

      await deleteObject("messageMedia", `${workspaceIdStr}/${safeFileName}`);

      return routeData({
        success: true,
        error: null,
        campaignUpdate: [campaignUpdate],
        removedFileName: safeFileName,
      }, { headers });
    } catch (error) {
      logger.error("Campaign Error", error);
      return routeData({ success: false, error }, { headers });
    }
  }
  return routeData({ success: false, error: "Method not allowed" }, { status: 405 });
}
