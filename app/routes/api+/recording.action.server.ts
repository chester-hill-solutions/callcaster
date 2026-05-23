import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSid = params.CallSid?.trim();

  if (!callSid) {
    return routeData({ error: "Missing CallSid" }, { status: 400 });
  }

  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );

  const validation = await validateTwilioWebhookForCallSid({
    request,
    supabase,
    callSid,
    params,
  });
  if (!validation.ok) {
    return validation.response;
  }

  logger.debug("Recording webhook received", { data: params });
  return routeData(params);
};
