import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import type { ActionFunctionArgs } from "react-router";
import type { Database } from "@/lib/db-types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSid = params.CallSid?.trim();

  if (!callSid) {
    return routeData({ error: "Missing CallSid" }, { status: 400 });
  }

  const client = createClient<Database>(
    env.BASE_URL(),
    env.BASE_URL(),
  );

  const validation = await validateTwilioWebhookForCallSid({
    request,
    client,
    callSid,
    params,
  });
  if (!validation.ok) {
    return validation.response;
  }

  logger.debug("Recording webhook received", { data: params });
  return routeData(params);
};
