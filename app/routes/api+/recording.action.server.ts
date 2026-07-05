import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSid = params.CallSid?.trim();

  if (!callSid) {
    return routeData({ error: "Missing CallSid" }, { status: 400 });
  }

  const forbidden = await requireTwilioSignature(request, { callSid });
  if (forbidden) return forbidden;

  logger.debug("Recording webhook received", { data: params });
  return routeData(params);
};
