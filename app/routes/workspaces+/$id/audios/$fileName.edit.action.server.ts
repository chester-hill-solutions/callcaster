import { data as routeData, redirect } from "react-router";

import { createWorkspaceAudioClip } from "@/lib/audio-clip.server";
import { defineAction } from "@/lib/handler.server";
import { MemberRole } from "@/lib/member-role";
import { hasMinRole, workspaceRouteAuth } from "@/lib/workspace-route.server";

function parseMs(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
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
    if (!sourceFileName) {
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

    return redirect(`../../audios?saved=${encodeURIComponent(result.fileName)}`, {
      headers,
    });
  },
});
