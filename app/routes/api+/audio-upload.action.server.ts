import { data as routeData } from "react-router";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { defineAction } from "@/lib/handler.server";
import { uploadWorkspaceAudioApi } from "@/lib/platform-media.server";

export const action = defineAction({
  auth: ({ request }: { request: Request }) => requireDualAuth(request),
  sideEffects: ["external"],
  handler: async ({ request, auth }) => {
    const user = getDualAuthUser(auth);
    if (!user) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const workspaceId = formData.get("workspaceId");
    const rawMediaName = formData.get("media-name");
    const file = formData.get("media");

    if (typeof workspaceId !== "string" || workspaceId.length === 0) {
      return routeData({ error: "Missing workspace" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return routeData(
        { error: "Please choose an audio file to upload." },
        { status: 400 },
      );
    }

    const mediaName =
      typeof rawMediaName === "string" && rawMediaName.trim().length > 0
        ? rawMediaName
        : file.name;

    const result = await uploadWorkspaceAudioApi(
      user.id,
      workspaceId,
      mediaName,
      file,
    );
    if (!result.ok) {
      return routeData({ error: result.error }, { status: result.status });
    }

    return routeData({ name: result.audio.name });
  },
});
