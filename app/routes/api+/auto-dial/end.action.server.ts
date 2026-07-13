import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
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
  const { workspaceId: workspace_id } = await d.safeParseJson<{ workspaceId?: string }>(request);
  if (typeof workspace_id !== "string") {
    return routeData({ error: "Missing workspaceId" }, { status: 400 });
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
    const conferenceIds = await findActiveConferenceIdsForUser(workspace_id, user.id);
    await Promise.all(
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

          const calls = await findCallsByConferenceId(workspace_id, conferenceId);
          logger.debug("Conference calls data:", calls);
          if (!calls.length) return;
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
          d.logger.error(`Error updating conference ${conferenceId}:`, confError);
        }
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    d.logger.error("Error listing or updating conferences:", error);
    return routeData({ error: message }, { status: 500 });
  }

  return routeData({ success: true });
  },
});
