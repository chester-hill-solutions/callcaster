import { createWorkspaceTwilioInstance, safeParseJson } from "@/lib/database.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { resolveJsonAuthSession } from "@/lib/api-auth.server";
import { hangupTwiml } from "@/lib/twilio-twiml.server";
import type { ActionFunctionArgs } from "react-router";
import type { Database, Tables } from "@/lib/db-types";
import {
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

export const action = async ({
  request,
  deps,
}: ActionFunctionArgs & { deps?: AutoDialEndDeps }) => {

  const d = {
    verifyAuth: deps?.verifyAuth ?? resolveJsonAuthSession,
    safeParseJson: deps?.safeParseJson ?? safeParseJson,
    createWorkspaceTwilioInstance:
      deps?.createWorkspaceTwilioInstance ?? createWorkspaceTwilioInstance,
    logger: deps?.logger ?? logger,
  };
  const { user } = await d.verifyAuth(request);
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
    const conferences = await twilio.conferences.list({
      friendlyName: user.id,
      status: "in-progress" as const,
    });
    await Promise.all(
      conferences.map(async (conf) => {
        try {
          await twilio.conferences(conf.sid).update({ status: "completed" });

          const calls = await findCallsByConferenceId(workspace_id, conf.sid);
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
          d.logger.error(`Error updating conference ${conf.sid}:`, confError);
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
}
