import { data as routeData, redirect } from "react-router";
import {
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
} from "@/lib/database/workspace.server";
import { listWorkspaceAudiosApi } from "@/lib/platform-media.server";
import { MemberRole } from "@/lib/member-role";
import { isEmail, isPhoneNumber } from "@/lib/utils";
import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

/**
 * Inbound calls only reach voicemail when `inbound_action` holds an email
 * address — see `app/routes/api+/inbound.action.server.ts`. Anything else
 * (a forward-to number, "webhook_only", or empty) means the greeting never
 * plays, so setup has to describe what enabling voicemail would replace.
 */
function describeRouting(inboundAction: string | null): string | null {
  if (!inboundAction) return null;
  if (isPhoneNumber(inboundAction)) return `Forwards calls to ${inboundAction}`;
  if (isEmail(inboundAction)) return `Sends voicemail to ${inboundAction}`;
  if (inboundAction === "webhook_only") return "Handled by webhook only";
  return null;
}

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read", "external"],
  handler: async ({ auth }) => {
    const { headers, user, workspaceId, userRole } = auth;

    if (userRole === MemberRole.Caller) {
      return redirect(`/workspaces/${workspaceId}/voicemails`, { headers });
    }

    const [{ data: phoneNumbers }, { data: users }, greetingsResult] =
      await Promise.all([
        getWorkspacePhoneNumbers({ workspaceId }),
        getWorkspaceUsers({ workspaceId }),
        listWorkspaceAudiosApi(user.id, workspaceId),
      ]);

    // Caller IDs are outbound-only, so they can never play an inbound greeting.
    const numbers = (phoneNumbers ?? [])
      .filter((number) => number.type !== "caller_id")
      .map((number) => ({
        id: number.id,
        phone_number: number.phone_number,
        friendly_name: number.friendly_name,
        inbound_audio: number.inbound_audio,
        currentRouting: describeRouting(number.inbound_action),
        // Voicemail replaces any routing that isn't already an email.
        routingWouldChange:
          !number.inbound_action || !isEmail(number.inbound_action),
      }));

    const members = (users ?? [])
      .filter((member) => member?.username && isEmail(member.username))
      .map((member) => ({
        id: member.id,
        email: member.username,
        name: [member.first_name, member.last_name].filter(Boolean).join(" "),
      }));

    return routeData(
      {
        numbers,
        members,
        greetings: greetingsResult.ok ? greetingsResult.audios : [],
        error: greetingsResult.ok ? null : greetingsResult.error,
      },
      { headers },
    );
  },
});
