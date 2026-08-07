import { handleAcdRouterRequest } from "@/lib/acd/acd-router.server";
import {
  requireTwilioSignature,
  twilioWebhookForbiddenHangup,
} from "@/lib/twilio-webhook.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: async ({ request }) => {
    const formData = await request.clone().formData();
    const callSid = String(formData.get("CallSid") ?? "");
    // A genuine Twilio voice callback to this URL always carries CallSid.
    // Omitting the option here (rather than requiring it) would silently
    // downgrade validation to the main-account token instead of this
    // call's workspace token — fail closed instead.
    if (!callSid) return twilioWebhookForbiddenHangup();
    const forbidden = await requireTwilioSignature(request, { callSid });
    return forbidden ?? null;
  },
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request }) => handleAcdRouterRequest(request, "agent-bridge"),
});
