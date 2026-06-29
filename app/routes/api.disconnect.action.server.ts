import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { safeParseJson } from "@/lib/database.server";
import { createParentTwilioInstance } from "@/twilio.server";
import { pauseTwiml } from "@/lib/twilio-twiml.server";
import type { ActionFunctionArgs } from "react-router";

type DisconnectRequestBody = {
  call?: {
    parameters?: {
      CallSid?: string;
    };
  };
};

const getCallSid = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const { call } = body as DisconnectRequestBody;
  const callSid = call?.parameters?.CallSid;

  return typeof callSid === "string" && callSid.length > 0 ? callSid : null;
};

export const action = async ({ request }: ActionFunctionArgs) => {

  const { TWILIO_SID, TWILIO_AUTH_TOKEN } = process.env;

  if (!TWILIO_SID || !TWILIO_AUTH_TOKEN) {
    logger.error("Missing Twilio credentials.");
    return routeData(
      { error: "Twilio credentials are not configured." },
      { status: 500 },
    );
  }

  const body = await safeParseJson<unknown>(request);
  const callSid = getCallSid(body);

  if (!callSid) {
    return routeData({ error: "Missing CallSid parameter." }, { status: 400 });
  }

  const client = createParentTwilioInstance();

  try {
    await client.calls(callSid).update({ twiml: pauseTwiml(60) });
    return routeData({ success: true });
  } catch (error) {
    logger.error("Failed to update call status", error);
    return routeData(
      { error: "Failed to pause the call." },
      { status: 500 },
    );
  }
}
