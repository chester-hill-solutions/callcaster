import { AudioUploadError, getSafeMediaBaseName, normalizeUploadedAudio } from "@/lib/audio.server";
import { data as routeData, redirect } from "react-router";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth.server";
import { uploadObject } from "@/lib/object-storage.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {

  const { headers } = await verifyAuth(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return routeData(
      { success: false, error: "Workspace does not exist" },
      { headers },
    );
  }
  const formData = await request.formData();
  const mediaName = formData.get("media-name") as string;
  const mediaToUpload = formData.get("media");

  logger.debug("Media To Upload:", mediaToUpload);

  try {
    if (!(mediaToUpload instanceof File)) {
      throw new AudioUploadError("Please choose an audio file to upload.");
    }

    const safeMediaName = getSafeMediaBaseName(mediaName);
    const normalizedAudio = await normalizeUploadedAudio(mediaToUpload);
    try {
      await uploadObject("workspaceAudio", `${workspaceId}/${safeMediaName}.${normalizedAudio.extension}`, normalizedAudio.buffer, { contentType: normalizedAudio.contentType });
    } catch (uploadError: any) {
      return routeData({ success: false, error: uploadError?.message || "Upload failed" }, { headers });
    }

    return redirect(`../audios?uploaded=1`, { headers });
  } catch (error) {
    logger.error("Workspace audio upload failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to upload audio.";
    const status = error instanceof AudioUploadError ? error.status : 500;
    return routeData({ success: false, error: message }, { headers, status });
  }
}
