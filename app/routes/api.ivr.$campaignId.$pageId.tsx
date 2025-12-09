import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { env } from "@/lib/env.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "@/lib/database.types";

const MAX_RETRIES = 5;
const RETRY_DELAY = 200; 

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getCallWithRetry = async (supabase: SupabaseClient<Database>, callSid: string, retries = 0) => {
  const { data, error } = await supabase
    .from("call")
    .select('*, campaign(*, ivr_campaign(*, script(*)))')
    .eq("sid", callSid)
    .single();

  if (error || !data) {
    if (retries < MAX_RETRIES) {
      await sleep(RETRY_DELAY);
      return getCallWithRetry(supabase, callSid, retries + 1);
    }
    throw new Error("Failed to retrieve call after multiple attempts");
  }

  return data;
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
  const twiml = new Twilio.twiml.VoiceResponse();
  const { pageId, campaignId } = params as { pageId: string; campaignId: string };
  const formData = await request.formData();
  const callSid = formData.get('CallSid') as string | null;
  
  if (!callSid || !campaignId || !pageId) {
    return new Response("Missing required parameters", { status: 400 });
  }
  try {
    const callData = await getCallWithRetry(supabase, callSid);
    const script = (callData.campaign?.ivr_campaign?.[0]?.script?.steps as unknown) as { pages: Record<string, { blocks: string[] }> };
    if (!script || !script.pages) {
      throw new Error("Invalid script structure");
    }
    const currentPage = script.pages[pageId];
    if (currentPage && currentPage.blocks.length > 0) {
      const firstBlockId = currentPage.blocks[0];
      twiml.redirect(`/api/ivr/${campaignId}/${pageId}/${firstBlockId}`);
    } else {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
    }
  } catch (e) {
    console.error(e);
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
};