import { redirect } from "react-router";

import { isSafeObjectName } from "@/lib/audio-upload";
import { defineLoader } from "@/lib/handler.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";

/** Long enough to scrub through a clip; short enough that a leaked link dies quickly. */
const PREVIEW_URL_TTL_SECONDS = 300;

/**
 * Streams one library recording to a workspace member, for in-editor preview.
 *
 * A same-origin path the script editor can hand straight to an `<audio>`
 * element: it proves membership, then redirects to a short-lived signed URL
 * for the object. Fresh uploads work immediately because nothing is cached
 * or listed ahead of time — the file name is the whole contract.
 */
export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read", "external"],
  handler: async ({ auth: result, params }) => {
    if (!result.ok) return result.response;
    const { headers, workspaceId } = result.ctx;

    const fileName = params.fileName;
    if (!fileName || !isSafeObjectName(fileName)) {
      throw new Response("Audio not found", { status: 404, headers });
    }

    const src = await createSignedObjectUrl(
      "workspaceAudio",
      `${workspaceId}/${fileName}`,
      PREVIEW_URL_TTL_SECONDS,
    );

    const responseHeaders = new Headers(headers);
    responseHeaders.set("Cache-Control", "private, no-store");
    return redirect(src, { headers: responseHeaders });
  },
});
