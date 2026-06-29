import { releaseAssignedQueueForUser } from "@/lib/queue-status";
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
import { generateToken } from "@/lib/twilio-token.server";
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
import type { ActionFunctionArgs } from "react-router";
import { logger } from "@/lib/logger.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {

  const { campaign_id } = params;

  const { supabaseClient, headers, user } = await verifyAuth(request);
  if (!user || !campaign_id) {
    throw redirect("/signin");
  }
  const result = await releaseAssignedQueueForUser(
    supabaseClient,
    user.id,
    campaign_id,
  );

  if (!result.ok) {
    logger.error("Error releasing assigned campaign queue rows:", result.error);
    throw new Error(result.error);
  }

  return redirect("/workspaces", { headers });
}
