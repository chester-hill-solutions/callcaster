import { data as routeData, redirect } from "react-router";

import {
  AudioUploadError,
  NORMALIZED_AUDIO_EXTENSION,
  normalizeUploadedAudio,
  probeAudioDurationMs,
} from "@/lib/audio.server";
import { resolveAvailableBaseName } from "@/lib/audio-upload";
import { listMediaObjects } from "@/lib/adapters/media-library.adapter.server";
import { upsertAudioMetadata } from "@/lib/database/workspace-audio-metadata.server";
import { defineAction } from "@/lib/handler.server";
import { logger } from "@/lib/logger.server";
import { ObjectExistsError, uploadObject } from "@/lib/object-storage.server";
import { workspaceRouteAuth } from "@/lib/workspace-route.server";

/**
 * Named for when it was taken; the user renames by clipping.
 *
 * Deliberately NOT "recording-": that prefix is reserved for Twilio call
 * recordings and isWorkspaceAudioFile() filters it out of the library, so a
 * take named that way would upload successfully and then be invisible.
 */
function defaultRecordingName() {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "-")
    .slice(0, 19);
  return `recorded-${stamp}`;
}

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write", "external"],
  handler: async ({ request, auth }) => {
    const { headers, user, workspaceId } = auth;

    if (workspaceId == null) {
      return routeData(
        { success: false, error: "Workspace does not exist" },
        { headers },
      );
    }

    try {
      const formData = await request.formData();
      const media = formData.get("media");

      if (!(media instanceof File)) {
        throw new AudioUploadError("No recording was received.");
      }

      // MediaRecorder gives webm/opus or mp4; both are in the accept list and
      // ffmpeg normalizes them to the canonical mono 44.1kHz mp3.
      const normalized = await normalizeUploadedAudio(media);

      const existing = await listMediaObjects("workspaceAudio", workspaceId);
      const takenBaseNames = existing.map((item) =>
        item.name.replace(/\.[^.]+$/, ""),
      );
      const baseName = resolveAvailableBaseName(
        defaultRecordingName(),
        takenBaseNames,
      );
      const fileName = `${baseName}.${NORMALIZED_AUDIO_EXTENSION}`;

      await uploadObject(
        "workspaceAudio",
        `${workspaceId}/${fileName}`,
        normalized.buffer,
        {
          cacheControl: "60",
          contentType: normalized.contentType,
          upsert: false,
        },
      );

      // Prefer the server's own measurement over the client's elapsed timer.
      const durationMs = await probeAudioDurationMs(normalized.buffer);

      await upsertAudioMetadata({
        workspaceId,
        fileName,
        origin: "recording",
        durationMs,
        sizeBytes: normalized.buffer.length,
        contentType: normalized.contentType,
        createdBy: user.id,
      });

      // Straight into the editor: record -> trim -> save is one flow.
      return redirect(`../audios/${encodeURIComponent(fileName)}/edit`, {
        headers,
      });
    } catch (error) {
      logger.error("Workspace audio recording failed", error);

      if (error instanceof ObjectExistsError) {
        return routeData(
          { success: false, error: "That recording name is already taken. Try again." },
          { headers, status: 409 },
        );
      }
      const message =
        error instanceof AudioUploadError
          ? error.message
          : "Failed to save the recording.";
      const status = error instanceof AudioUploadError ? error.status : 500;
      return routeData({ success: false, error: message }, { headers, status });
    }
  },
});
