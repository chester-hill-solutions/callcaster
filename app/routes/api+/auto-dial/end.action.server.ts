import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { safeParseJson } from "@/lib/request-utils.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { resolveJsonAuthSession } from "@/lib/api-auth.server";
import { hangupTwiml } from "@/lib/twilio-twiml.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";
import type { Database, Tables } from "@/lib/db-types";
import {
  findActiveConferenceIdsForUser,
  findCallsByConferenceId,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import type TwilioSDK from "twilio";

type TwilioClient = TwilioSDK.Twilio;

type AutoDialEndDeps = Partial<{
  verifyAuth: typeof resolveJsonAuthSession;
  safeParseJson: <T>(request: Request) => Promise<T>;
  createWorkspaceTwilioInstance: (args: { workspace_id: string }) => Promise<TwilioClient>;
  logger: typeof logger;
}>;

function isOwnConferenceName(value: unknown, userId: string): value is string {
  return typeof value === "string" &&
    value.startsWith(`${userId}~`) &&
    value.length > userId.length + 1;
}

export const action = defineAction({
  auth: async (args) => {
    const { deps } = args as ActionFunctionArgs & { deps?: AutoDialEndDeps };
    const verifyAuth = deps?.verifyAuth ?? resolveJsonAuthSession;
    const { user } = await verifyAuth(args.request);
    return user;
  },
  sideEffects: ["db-write", "twilio"],
  handler: async (ctx) => {
  const { request, auth: user } = ctx;
  const { deps } = ctx as typeof ctx & { deps?: AutoDialEndDeps };

  const d = {
    safeParseJson: deps?.safeParseJson ?? safeParseJson,
    createWorkspaceTwilioInstance:
      deps?.createWorkspaceTwilioInstance ?? createWorkspaceTwilioInstance,
    logger: deps?.logger ?? logger,
  };
  const { workspaceId: workspace_id, conferenceName } = await d.safeParseJson<{ workspaceId?: string; conferenceName?: unknown }>(request);
  if (typeof workspace_id !== "string") {
    return routeData({ error: "Missing workspaceId" }, { status: 400 });
  }

  try {
    await requireWorkspaceAccess({ user, workspaceId: workspace_id });
  } catch {
    return routeData({ error: "Forbidden" }, { status: 403 });
  }

  if (conferenceName !== undefined && !isOwnConferenceName(conferenceName, user.id)) {
    return routeData({ error: "Invalid conferenceName" }, { status: 400 });
  }

  const twilio = await d.createWorkspaceTwilioInstance({ workspace_id });

  const updateOutreachAttempt = async (
    id: string,
    update: Partial<Tables<"outreach_attempt">>,
  ): Promise<Tables<"outreach_attempt">> => {
    const result = await updateOutreachAttemptForWorkspace(workspace_id, id, update);
    if (result instanceof Response) {
      throw new Error(await result.text());
    }
    return result;
  };

  try {
    let conferenceIds: string[];
    if (typeof conferenceName === "string") {
      conferenceIds = [conferenceName];
    } else {
      const recordedIds = await findActiveConferenceIdsForUser(workspace_id, user.id);
      const activeConferences = await twilio.conferences.list({ status: "in-progress" });
      const ownConferences = activeConferences
        .filter((conference) => isOwnConferenceName(conference.friendlyName, user.id));
      const ownSids = new Set(ownConferences.map((conference) => conference.sid));
      const ownNames = ownConferences.map((conference) => conference.friendlyName);
      conferenceIds = [...new Set([
        ...recordedIds.filter((id) => !ownSids.has(id)),
        ...ownNames,
      ])];
    }
    const stopped = await Promise.all(
      conferenceIds.map(async (conferenceId) => {
        try {
          if (conferenceId.startsWith("CF")) {
            await twilio.conferences(conferenceId).update({ status: "completed" });
          } else {
            const conferences = await twilio.conferences.list({
              friendlyName: conferenceId,
              status: "in-progress" as const,
            });
            await Promise.all(
              conferences.map(({ sid }) =>
                twilio.conferences(sid).update({ status: "completed" }),
              ),
            );
          }
        } catch (confError) {
          d.logger.error(`Error completing conference ${conferenceId}:`, confError);
          return false;
        }

        try {
          const calls = await findCallsByConferenceId(workspace_id, conferenceId);
          logger.debug("Conference calls data:", calls);
          if (!calls.length) return true;
          await Promise.all(
            calls.map(async (call) => {
              if (!call.outreach_attempt_id) return;
              try {
                  await updateOutreachAttempt(
                    call.outreach_attempt_id.toString(),
                    { disposition: "completed" },
                  );
                  await twilio
                    .calls(call.sid)
                    .update({ twiml: hangupTwiml() });
              } catch (callError) {
                d.logger.error(`Error updating call ${call.sid}:`, callError);
              }
            }),
          );
        } catch (confError) {
          d.logger.error(`Error cleaning up completed conference ${conferenceId}:`, confError);
        }
        return true;
      }),
    );
    if (stopped.includes(false)) {
      return routeData(
        { error: "Could not stop all predictive conferences. Try again." },
        { status: 502 },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    d.logger.error("Error listing or updating conferences:", error);
    return routeData({ error: message }, { status: 500 });
  }

  return routeData({ success: true });
  },
});
