import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import Twilio from "twilio";
import type { ActionFunctionArgs } from "react-router";
import type { Database } from "@/lib/database.types";

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, unknown>;
}

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
  const twiml = new Twilio.twiml.VoiceResponse();
  const { numberId, pageId } = params as { numberId: string; pageId: string };
  const formData = await request.formData();
  const paramsObj = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSid = paramsObj.CallSid ?? null;

  if (!callSid || !numberId || !pageId) {
    return new Response("Missing required parameters", { status: 400 });
  }

  const validation = await validateTwilioWebhookForCallSid({
    request,
    supabase,
    callSid,
    params: paramsObj,
  });
  if (!validation.ok) {
    return validation.response;
  }

  try {
    const { data: number } = await supabase
      .from("workspace_number")
      .select("id, inbound_script_id")
      .eq("id", Number(numberId))
      .single();

    if (!number?.inbound_script_id) {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "application/xml" },
      });
    }

    const { data: script } = await supabase
      .from("script")
      .select("steps")
      .eq("id", number.inbound_script_id)
      .single();

    const steps = script?.steps as Script | null | undefined;
    if (!steps?.pages) {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "application/xml" },
      });
    }

    const currentPage = steps.pages[pageId];
    if (currentPage && currentPage.blocks.length > 0) {
      const firstBlockId = currentPage.blocks[0];
      twiml.redirect(`/api/inbound-ivr/${numberId}/${pageId}/${firstBlockId}`);
    } else {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
    }
  } catch (e) {
    logger.error("Error processing inbound IVR page:", e);
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });

};
