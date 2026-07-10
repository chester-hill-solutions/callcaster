import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { checkSchedule, getUserRole } from "@/lib/database.server";
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
import type { LoaderFunctionArgs } from "react-router";
import { MemberRole } from "@/lib/member-role";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const { campaign_id: id } = params;
  const { user, workspaceId, userRole, headers } = getWorkspaceRouteContext(context);
  if (!user || !workspaceId || !id) throw redirect("/signin");

  const verifiedNumbers = await getVerifiedNumbers(user.id);
  const {
    workspaceData,
    campaign,
    campaignDetails,
    audiences,
    queueCount,
    completedCount,
    attempts,
  } = await getCallScreenData(id, workspaceId, user.id);
  if (!workspaceData || !campaign) throw redirect("/signin");
  const rawTwilioData = workspaceData.twilio_data;
  const twilioData = (
    typeof rawTwilioData === "string"
      ? JSON.parse(rawTwilioData)
      : rawTwilioData
  ) as { sid: string };
  const queue = await getQueueByDialType(id, campaign.dial_type ?? "", user.id);
  const token = await generateToken({
    twilioAccountSid: twilioData.sid,
    twilioApiKey: workspaceData.key as string,
    twilioApiSecret: workspaceData.token as string,
    identity: user.id,
  });
  const nextRecipient = getNextRecipient(queue, campaign.dial_type ?? "", user.id);
  const initalCallsList = getInitialCallsList(attempts || []);
  const initialRecentCall = getInitialRecentCall(attempts || []);
  const initialRecentAttempt = getInitialRecentAttempt(attempts || []);
  const hasAccess = [MemberRole.Owner, MemberRole.Admin].includes(userRole as MemberRole);
  const isActive = campaign ? checkSchedule(campaign) : false;

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
  };
};
