import { data as routeData, redirect } from "react-router";
import { uploadWorkspaceAudioApi } from "@/lib/platform-media.server";
import { patchWorkspaceNumber } from "@/lib/platform-workspace-numbers.server";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import { getErrorDetail, toUserMessage } from "@/lib/user-message";
import { isEmail } from "@/lib/utils";
import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write", "external"],
  handler: async ({ request, auth }) => {
    const { headers, user, workspaceId, userRole } = auth;

    if (userRole === MemberRole.Caller) {
      return routeData(
        { error: "You do not have permission to set up voicemail." },
        { headers, status: 403 },
      );
    }

    const formData = await request.formData();
    const source = String(formData.get("greeting-source") ?? "existing");
    const numberIds = formData
      .getAll("numberIds")
      .map((value) => String(value))
      .filter((value) => value.length > 0);

    if (numberIds.length === 0) {
      return routeData(
        { error: "Choose at least one phone number for this greeting." },
        { headers, status: 400 },
      );
    }

    // A greeting alone is dead config: inbound calls only reach voicemail when
    // `inbound_action` holds an email, which is also where the recording gets
    // sent. See `api+/inbound.action.server.ts` and `api+/email-vm.action.server.ts`.
    const notifyEmail = String(formData.get("notify-email") ?? "");
    if (!isEmail(notifyEmail)) {
      return routeData(
        { error: "Choose who should receive the voicemails." },
        { headers, status: 400 },
      );
    }

    let greetingName: string;

    if (source === "upload") {
      const file = formData.get("media");
      const mediaName = String(formData.get("media-name") ?? "");

      if (!(file instanceof File) || file.size === 0) {
        return routeData(
          { error: "Choose an audio file to upload." },
          { headers, status: 400 },
        );
      }

      const uploaded = await uploadWorkspaceAudioApi(
        user.id,
        workspaceId,
        mediaName,
        file,
      );

      if (!uploaded.ok) {
        logger.error("Voicemail greeting upload failed", {
          detail: getErrorDetail(uploaded.error),
        });
        return routeData(
          {
            error: toUserMessage(
              uploaded.error,
              "We couldn't process that audio file. Try a different recording.",
            ),
          },
          { headers, status: uploaded.status },
        );
      }

      greetingName = uploaded.audio.name;
    } else {
      greetingName = String(formData.get("existing-greeting") ?? "");
      if (greetingName.length === 0) {
        return routeData(
          { error: "Choose a greeting to play." },
          { headers, status: 400 },
        );
      }
    }

    for (const numberId of numberIds) {
      const result = await patchWorkspaceNumber(user.id, workspaceId, numberId, {
        inbound_audio: greetingName,
        inbound_action: notifyEmail,
      });

      if (!result.ok) {
        logger.error("Voicemail greeting assignment failed", {
          numberId,
          detail: getErrorDetail(result.error),
        });
        return routeData(
          {
            error: toUserMessage(
              result.error,
              "We couldn't save the greeting to that number. Please try again.",
            ),
          },
          { headers, status: 400 },
        );
      }
    }

    return redirect(`/workspaces/${workspaceId}/voicemails?configured=1`, {
      headers,
    });
  },
});
