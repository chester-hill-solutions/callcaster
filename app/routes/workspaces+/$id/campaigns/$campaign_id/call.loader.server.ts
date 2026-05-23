import {
  buildQueuedQueueUpdate,
  COMPLETED_QUEUE_COUNT_FILTER,
  isAssignedToUser,
  isQueued,
} from "@/lib/queue-status";
import {
  handleCall,
  handleConference,
  handleContact,
  handleQueue,
} from "@/lib/callscreenActions";
import {
  normalizeProviderStatus,
  getStateMachineAction,
} from "@/lib/call-status";
import { checkSchedule, getUserRole } from "@/lib/database.server";
import { generateToken } from "@/routes/api+/token.loader.server";
import { MemberRole } from "@/lib/member-role";
import { playTone } from "@/lib/utils";
import { redirect } from "react-router";
import { SupabaseClient } from "@supabase/supabase-js";
import { Tables } from "@/lib/database.types";
import { verifyAuth } from "@/lib/supabase.server";
import type {
  LoaderData,
  QueueItem,
  OutreachAttempt,
  UseSupabaseRealtimeProps,
  AppUser,
  BaseUser,
  ActiveCall,
  CampaignDetails
} from "@/lib/types";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { campaign_id: id, id: workspaceId } = params;
  const {
    supabaseClient: supabase,
    user,
  } = await verifyAuth(request);
  if (!user || !workspaceId || !id) throw redirect("/signin");

  const verifiedNumbers = await getVerifiedNumbers(supabase, user.id);
  const { workspaceData, campaign, campaignDetails, audiences, queueCount, completedCount, attempts } = await getCallScreenData(supabase, id, workspaceId, user.id);
  const twilioData = workspaceData.twilio_data as { sid: string };
  const queue = await getQueueByDialType(supabase, id, campaign.dial_type, user.id);
  const token = generateToken({
    twilioAccountSid: twilioData.sid,
    twilioApiKey: workspaceData.key as string,
    twilioApiSecret: workspaceData.token as string,
    identity: user.id,
  });
  const nextRecipient = getNextRecipient(queue, campaign?.dial_type, user.id);
  const initalCallsList = getInitialCallsList(attempts || []);
  const initialRecentCall = getInitialRecentCall(attempts || []);
  const initialRecentAttempt = getInitialRecentAttempt(attempts || []);

  const userRole = await getUserRole({
    supabaseClient: supabase,
    user: user as unknown as BaseUser,
    workspaceId
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
  }
}
