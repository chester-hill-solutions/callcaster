import { data as routeData, redirect } from "react-router";

import { createWorkspaceAudioClip } from "@/lib/audio-clip.server";
import { defineAction } from "@/lib/handler.server";
import { MemberRole } from "@/lib/member-role";
import { hasMinRole, workspaceRouteAuth } from "@/lib/workspace-route.server";

function parseMs(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * A route param arrives URL-decoded, so `%2F` and `%2E%2E` become real path
 * separators. These are concatenated into an object key, and while S3 treats
 * keys as opaque strings today, that is a property of the store rather than a
 * check we perform — so reject the traversal characters outright.
 */
function isSafeObjectName(name: string): boolean {
  return !name.includes("/") && !name.includes("\\") && !name.includes("..");
}

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write", "external"],
  handler: async ({ request, params, auth }) => {
    const { headers, user, workspaceId, userRole } = auth;

    if (!hasMinRole(userRole, MemberRole.Member)) {
      return routeData(
        { error: "You don't have permission to perform this action" },
        { headers, status: 403 },
      );
    }

    if (workspaceId == null) {
      return routeData(
        { success: false, error: "Workspace does not exist" },
        { headers },
      );
    }

    const sourceFileName = params.fileName;
    if (!sourceFileName || !isSafeObjectName(sourceFileName)) {
      return routeData(
        { success: false, error: "Audio not found" },
        { headers, status: 404 },
      );
    }

    const formData = await request.formData();
    const startMs = parseMs(formData.get("startMs"));
    const endMs = parseMs(formData.get("endMs"));
    const name = formData.get("name");
    const mode = formData.get("mode") === "overwrite" ? "overwrite" : "new";

    // Overwriting replaces audio that live campaigns may already play, so it
    // only proceeds when the UI confirms the user was shown the usage list.
    if (mode === "overwrite" && formData.get("confirmOverwrite") !== "true") {
      return routeData(
        { success: false, error: "Overwriting this audio must be confirmed." },
        { headers, status: 400 },
      );
    }

    const result = await createWorkspaceAudioClip({
      userId: user.id,
      workspaceId,
      sourceFileName,
      startMs,
      endMs,
      name: typeof name === "string" ? name : undefined,
      mode,
    });

    if (!result.ok) {
      return routeData(
        { success: false, error: result.error },
        { headers, status: result.status },
      );
    }

    // Absolute path — the `../../audios` relative form used to resolve to
    // `/workspaces/$id/audios/audios` in React Router's route-relative
    // resolution, dropping the user on a 404 after a successful edit
    // (same root cause as #1396's upload flow).
    return redirect(
      `/workspaces/${workspaceId}/audios?saved=${encodeURIComponent(result.fileName)}`,
      { headers },
    );
  },
});
