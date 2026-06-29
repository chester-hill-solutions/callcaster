export { action } from "./api.disconnect.action.server";

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

export { getCallSid };

