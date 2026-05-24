import { createWorkspaceTwilioInstance, safeParseJson } from "@/lib/database.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";
import type { Database, Tables } from "@/lib/database.types";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type TwilioSDK from "twilio";

type Supabase = SupabaseClient<Database>;
type TwilioClient = TwilioSDK.Twilio;

type AutoDialEndDeps = Partial<{
  verifyAuth: (
    request: Request,
  ) => Promise<{ supabaseClient: Supabase; user: User }>;
  safeParseJson: <T>(request: Request) => Promise<T>;
  createWorkspaceTwilioInstance: (args: {
    supabase: Supabase;
    workspace_id: string;
  }) => Promise<TwilioClient>;
  logger: typeof logger;
}>;

export const action = async ({
  request,
  deps,
}: ActionFunctionArgs & { deps?: AutoDialEndDeps }) => {

  const d = {
    verifyAuth: deps?.verifyAuth ?? verifyAuth,
    safeParseJson: deps?.safeParseJson ?? safeParseJson,
    createWorkspaceTwilioInstance:
      deps?.createWorkspaceTwilioInstance ?? createWorkspaceTwilioInstance,
    logger: deps?.logger ?? logger,
  };
  const { supabaseClient, user } = await d.verifyAuth(request);
  const { workspaceId: workspace_id } = await d.safeParseJson<{ workspaceId?: string }>(request);
  if (typeof workspace_id !== "string") {
    return routeData({ error: "Missing workspaceId" }, { status: 400 });
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
    return routeData({ error: message }, { status: 500 });
  }

  return routeData({ success: true });
}
