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
import { verifyAuth } from "@/lib/auth.server";
import type { BaseUser } from "@/lib/types";
import type { LoaderFunctionArgs } from "react-router";
import { MemberRole } from "@/lib/member-role";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { campaign_id: id, id: workspaceId } = params;
  const {user } = await verifyAuth(request);
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
  const twilioData = workspaceData.twilio_data as { sid: string };
  const queue = await getQueueByDialType(id, campaign.dial_type, user.id);
  const token = await generateToken({
    twilioAccountSid: twilioData.sid,
    twilioApiKey: workspaceData.key as string,
    twilioApiSecret: workspaceData.token as string,
    identity: user.id,
  });
  const nextRecipient = getNextRecipient(queue, campaign?.dial_type, user.id);
  const initalCallsList = getInitialCallsList(attempts || []);
  const initialRecentCall = getInitialRecentCall(attempts || []);
  const initialRecentAttempt = getInitialRecentAttempt(attempts || []);

  const userRole = await getUserRole({user: user as unknown as BaseUser,
    workspaceId,
  });
  const hasAccess = [MemberRole.Owner, MemberRole.Admin].includes(userRole?.role as MemberRole);
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
