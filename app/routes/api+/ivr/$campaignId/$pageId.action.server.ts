import { requireTwilioSignatureForIvrPage } from "@/lib/ivr-webhook-auth.server";
import { renderCampaignIvrPage } from "@/lib/campaign-ivr-page.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: ({ request, params }) =>
    requireTwilioSignatureForIvrPage(request, [params.campaignId, params.pageId]),
  sideEffects: ["db-read", "db-write", "external"],
  handler: ({ params, auth, request }) => renderCampaignIvrPage({
    campaignId: params.campaignId ?? "", pageId: params.pageId, requestUrl: request.url, ...auth,
  }),
});
