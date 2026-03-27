import { json, type ActionFunctionArgs } from "@remix-run/node";

import { verifyAuth } from "../../lib/supabase.server";
import { createWorkspaceTwilioInstance, safeParseJson } from "../../lib/database.server";
import type { Tables } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";

type AutoDialEndDeps = Partial<{
  verifyAuth: typeof verifyAuth;
  safeParseJson: typeof safeParseJson;
  createWorkspaceTwilioInstance: typeof createWorkspaceTwilioInstance;
  logger: typeof logger;
}>;

const resolveDeps = (deps?: AutoDialEndDeps) => {
  return {
    verifyAuth: deps?.verifyAuth ?? verifyAuth,
    safeParseJson: deps?.safeParseJson ?? safeParseJson,
    createWorkspaceTwilioInstance:
      deps?.createWorkspaceTwilioInstance ?? createWorkspaceTwilioInstance,
    logger: deps?.logger ?? logger,
  } as Required<AutoDialEndDeps>;
};

export const action = async ({
  request,
  deps,
}: ActionFunctionArgs & { deps?: AutoDialEndDeps }) => {
  const d = resolveDeps(deps);
  const { supabaseClient, user } = await d.verifyAuth(request);
  const { workspaceId: workspace_id } = await d.safeParseJson(request);
  if (typeof workspace_id !== "string") {
    return json({ error: "Missing workspaceId" }, { status: 400 });
  }
  const twilio = await d.createWorkspaceTwilioInstance({
    supabase: supabaseClient,
    workspace_id,
  });

  const updateOutreachAttempt = async (
    id: string,
    update: Partial<Tables<"outreach_attempt">>,
  ): Promise<Tables<"outreach_attempt">> => {
    try {
      const { data: outreachData, error } = await supabaseClient
        .from("outreach_attempt")
        .update(update)
        .eq("id", Number(id))
        .single();
      if (error) throw error;
      return outreachData;
    } catch (error) {
      d.logger.error("Error updating outreach attempt:", error);
      throw error;
    }
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

          const { data, error } = await supabaseClient
            .from("call")
            .select("sid, outreach_attempt_id, contact_id")
            .eq("conference_id", conf.sid);
          logger.debug("Conference calls data:", data);
          if (error) throw error;
          if (!data || !data.length) return;
          type CallRecord = Pick<
            Tables<"call">,
            "sid" | "outreach_attempt_id" | "contact_id"
          >;
          const calls = data.filter(
            (call): call is CallRecord =>
              call !== null &&
              typeof call.sid === "string" &&
              call.sid.length > 0,
          );
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
                    .update({ twiml: `<Response><Hangup/></Response>` });
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
    return json({ error: message }, { status: 500 });
  }

  return json({ success: true });
};
