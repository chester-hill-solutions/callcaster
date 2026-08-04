import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { checkSchedule } from "@/lib/database/campaign.server";
import { getUserRole } from "@/lib/database/workspace.server";
import { generateToken } from "@/lib/twilio-token.server";
import {
  getCallScreenData,
  getInitialCallsList,
  getInitialRecentAttempt,
  getInitialRecentCall,
  getNextRecipient,
  getQueueByDialType,
  getVerifiedNumbers,
} from "@/lib/call-screen.server";
import { redirect } from "react-router";
import { MemberRole } from "@/lib/member-role";
import { defineLoader } from "@/lib/handler.server";
import { getCallCoachingHydration } from "@/lib/call-coaching-hydration.server";
import { liveMediaCapabilities } from "@/lib/live-media-capabilities";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ params, auth }) => {
    const { campaign_id: id } = params;
    const { user, workspaceId, userRole } = auth;
    if (!user || !workspaceId || !id) throw redirect("/signin");

    const [verifiedNumbers, callScreenData] = await Promise.all([
      getVerifiedNumbers(user.id),
      getCallScreenData(id, workspaceId, user.id),
    ]);
    const {
      workspaceData,
      campaign,
      campaignDetails,
      audiences,
      queueCount,
      completedCount,
      attempts,
    } = callScreenData;
    if (!workspaceData || !campaign) throw redirect("/signin");
    const rawTwilioData = workspaceData.twilio_data;
    const twilioData = (
      typeof rawTwilioData === "string"
        ? JSON.parse(rawTwilioData)
        : rawTwilioData
    ) as { sid: string };
    const [queue, token] = await Promise.all([
      getQueueByDialType(id, campaign.dial_type ?? "", user.id),
      generateToken({
        twilioAccountSid: twilioData.sid,
        twilioApiKey: workspaceData.key as string,
        twilioApiSecret: workspaceData.token as string,
        identity: user.id,
      }),
    ]);
    const nextRecipient = getNextRecipient(queue, campaign.dial_type ?? "", user.id);
    const initalCallsList = getInitialCallsList(attempts || []);
    const initialRecentCall = getInitialRecentCall(attempts || [], nextRecipient);
    const initialRecentAttempt = getInitialRecentAttempt(attempts || [], nextRecipient);
    const hasAccess = [MemberRole.Owner, MemberRole.Admin].includes(userRole as MemberRole);
    const isActive = campaign ? checkSchedule(campaign) : false;
    // `useCallScreen` derives its live callSid as
    // `getCallSid(activeCall) ?? recentCall?.sid`, and on a reload there is no
    // activeCall yet — so the recent call is exactly the sid whose transcript
    // the panels are about to ask for. Hydrating any other call would be waste.
    //
    // Gated on the same capabilities as the panels: when neither the transcript
    // nor the coaching UI renders, the hook opens no EventSource and nothing
    // consumes a seed, so the four hydration queries would be pure waste on
    // every call-screen load for every workspace without the flags.
    const { showTranscript, showCoaching } = liveMediaCapabilities(
      workspaceData.feature_flags as Record<string, unknown> | undefined,
    );
    const initialCoaching =
      showTranscript || showCoaching
        ? await getCallCoachingHydration(workspaceId, initialRecentCall?.sid)
        : null;

    return {
      campaign,
      attempts,
      user,
      audiences,
      campaignDetails,
      credits: workspaceData.credits,
      workspaceId,
      queue,
      contacts: queue.map((queueItem) => queueItem.contact),
      nextRecipient,
      initalCallsList,
      initialRecentCall,
      initialRecentAttempt,
      token,
      count: queueCount,
      completed: completedCount,
      isActive,
      hasAccess,
      verifiedNumbers,
      featureFlags: workspaceData.feature_flags,
      initialCoaching,
    };
  },
});
