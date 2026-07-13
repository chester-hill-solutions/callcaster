import { handleAcdRouterRequest } from "@/lib/acd/acd-router.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: async ({ request }) => {
    const formData = await request.clone().formData();
    const callSid = String(formData.get("CallSid") ?? "");
    const forbidden = await requireTwilioSignature(request, callSid ? { callSid } : {});
    return forbidden ?? null;
  },
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request }) => handleAcdRouterRequest(request, "agent-bridge"),
});
