import type { ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import type { Database } from "@/lib/database.types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY()
  );

  const formData = await request.formData();
  const called = formData.get("Called") as string | null;
  if (!called) {
    twiml.say("Invalid request. Missing caller information.");
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const { data: numberRow, error: numberError } = await supabase
    .from("workspace_number")
    .select("workspace")
    .eq("phone_number", called)
    .eq("handset_enabled", true)
    .maybeSingle();

  if (numberError || !numberRow) {
    logger.debug("Inbound handset: number not found or not handset-enabled", {
      called,
      error: numberError?.message,
    });
    twiml.say("This number is not configured for handset.");
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const workspaceId = String(numberRow.workspace);

  const now = new Date().toISOString();
  const { data: session, error: sessionError } = await supabase
    .from("handset_session")
    .select("client_identity")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .gte("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError || !session) {
    twiml.say("No one is available to take your call. Please try again later.");
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  twiml.dial().client(session.client_identity);

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
};
