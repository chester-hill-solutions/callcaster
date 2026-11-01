import {
  buildCallUpsertFromTwilioParams,
  processCallStatusWebhook,
} from "@/lib/twilio-call-status.server";
import { data as routeData } from "react-router";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { defineAction } from "@/lib/handler.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { enqueueCallStatusSideEffects } from "@/lib/worker/enqueue-call-status.server";
import type { ActionFunctionArgs } from "react-router";
import { bindVerifiedFundedCallStatus } from "@/lib/voice-bridge-webhook.server";
import { recheckCampaignCompletion } from "@/lib/campaign-completion.server";
import { createTenantDb } from "@/server/tenant-db";

type CallStatusAuth = {
  params: Record<string, string>;
  callSid: string | null;
  funded?: { setup: boolean; workspaceId: string; campaignId?: number | null; pending?: boolean } | null;
};

export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs): Promise<CallStatusAuth | Response> => {
    // Clone before reading — Bun yields empty params on re-read after consume.
    const formData = await request.clone().formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const callSidRaw = params.CallSid ?? params.call_sid;
    if (!callSidRaw) {
      return { params, callSid: null };
    }
    const forbidden = await requireTwilioSignature(request, {
      callSid: callSidRaw,
      params,
    });
    if (forbidden) return forbidden;
    const funded = await bindVerifiedFundedCallStatus(request, params);
    if (funded instanceof Response) return funded;
    return { params, callSid: callSidRaw, funded };
  },
  // Sync upsert skips billing; the enqueued worker job debits terminal calls.
  sideEffects: ["db-write", "credit"],
  handler: async ({ auth }) => {
    const { params, callSid: callSidRaw, funded } = auth;
    if (!callSidRaw) {
      return routeData({ error: "Missing CallSid" }, { status: 400 });
    }
    if (funded?.pending) return routeData({ success: true });
    if (funded?.setup) {
      await recheckCampaignCompletion({ workspaceId: funded.workspaceId, campaignId: funded.campaignId,
        reason: "voice_setup_status", exec: createTenantDb(funded.workspaceId) });
      return routeData({ success: true });
    }

    const updateData = buildCallUpsertFromTwilioParams(params);
    const workspaceId = funded?.workspaceId ?? (await findCallBySid(callSidRaw))?.workspace ?? undefined;
    const { call } = await processCallStatusWebhook(updateData, { skipBilling: true, workspaceId });

    await enqueueCallStatusSideEffects(call, params);

    return routeData({ success: true });
  },
});
