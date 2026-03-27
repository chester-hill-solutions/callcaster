import { json, type ActionFunctionArgs } from "@remix-run/node";
import twilio from "twilio";
import { safeParseJson } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";

type DisconnectRequestBody = {
  call?: {
    parameters?: {
      CallSid?: string;
    };
  };
};

const TWIML_PAUSE_RESPONSE = '<Response><Pause length="60"/></Response>';

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
    return json(
      { error: "Twilio credentials are not configured." },
      { status: 500 },
    );
  }

  const body = await safeParseJson<unknown>(request);
  const callSid = getCallSid(body);

  if (!callSid) {
    return json({ error: "Missing CallSid parameter." }, { status: 400 });
  }

  const client = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

  try {
    await client.calls(callSid).update({ twiml: TWIML_PAUSE_RESPONSE });
    return json({ success: true });
  } catch (error) {
    logger.error("Failed to update call status", error);
    return json(
      { error: "Failed to pause the call." },
      { status: 500 },
    );
  }
};

