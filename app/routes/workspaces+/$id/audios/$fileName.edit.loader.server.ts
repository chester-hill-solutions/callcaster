import { data as routeData } from "react-router";

import { findAudioUsage } from "@/lib/database/audio-usage.server";
import { getAudioMetadata } from "@/lib/database/workspace-audio-metadata.server";
import { defineLoader } from "@/lib/handler.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";

const SIGNED_URL_TTL_SECONDS = 3600;

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read", "external"],
  handler: async ({ auth: result, params }) => {
    if (!result.ok) return result.response;
    const { headers, workspaceId } = result.ctx;

    const fileName = params.fileName;
    if (!fileName) {
      return routeData(
        { fileName: null, src: null, metadata: null, usage: [], error: "Audio not found" },
        { headers, status: 404 },
      );
    }

    const [src, metadata, usage] = await Promise.all([
      createSignedObjectUrl(
        "workspaceAudio",
        `${workspaceId}/${fileName}`,
        SIGNED_URL_TTL_SECONDS,
      ),
      // Absent for anything uploaded before the sidecar existed; the editor
      // reads the real duration off the decoded waveform anyway.
      getAudioMetadata(workspaceId, fileName),
      // Drives the overwrite confirmation: the user must see which campaigns
      // and IVR steps point at this filename before replacing it.
      findAudioUsage(workspaceId, fileName),
    ]);

    return routeData(
      { fileName, src, metadata, usage, error: null },
      { headers },
    );
  },
});
