import { handleAcdRouterRequest } from "@/lib/acd/acd-router.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs) => {
    const formData = await request.clone().formData();
    const callSid = String(formData.get("CallSid") ?? "");
    const forbidden = await requireTwilioSignature(request, callSid ? { callSid } : {});
    if (forbidden) return forbidden;
    return undefined;
  },
  sideEffects: ["twilio", "db-write"],
  handler: ({ request }) => handleAcdRouterRequest(request, "agent-status"),
});
