import type { SupabaseClient } from "@supabase/supabase-js";
import { checkSchedule, getHandsetNumberForWorkspace, getUserRole, requireWorkspaceAccess } from "@/lib/database.server";
import {
  getCallScreenData,
  getInitialCallsList,
  getInitialRecentAttempt,
  getInitialRecentCall,
  getNextRecipient,
  getQueueByDialType,
  getVerifiedNumbers,
} from "@/lib/call-screen.server";
import { loadCallLogPage } from "@/lib/call-log.server";
import {
  endHandsetSession,
  getHandsetLoaderData,
} from "@/lib/handset/handset-session.server";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";
import type { Database } from "@/lib/database.types";
import { MemberRole } from "@/lib/member-role";
import { generateToken } from "@/lib/twilio-token.server";
import {
  buildQueuedQueueUpdate,
  isAssignedToUser,
} from "@/lib/queue-status";
import { logger } from "@/lib/logger.server";

const EMPTY_LISTENING = {
  active: false,
  token: null,
  token_error: null,
} as const;

export async function getWorkspaceCallLogApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  requestUrl: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const callLog = await loadCallLogPage({
    supabaseClient,
    workspaceId,
    requestUrl,
  });

  return { ok: true as const, ...callLog };
}

async function loadListeningState(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  userId: string,
) {
  const { data: handsetData } = await getHandsetNumberForWorkspace({
    supabaseClient,
    workspaceId,
  });
  const handsetNumber = handsetData?.phone_number ?? null;
  const now = new Date().toISOString();
  const { data: session } = await supabaseClient
    .from("handset_session")
    .select("client_identity")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session?.client_identity) {
    return {
      handset_number: handsetNumber,
      listening: { ...EMPTY_LISTENING },
    };
  }

  const tokenResult = await createHandsetAccessToken({
    supabaseClient,
    workspaceId,
    clientIdentity: session.client_identity,
  });

  return {
    handset_number: handsetNumber,
    listening: {
      active: true,
      token: tokenResult.token,
      token_error: tokenResult.error,
    },
  };
}

export async function startCallListeningApi(
  supabaseClient: SupabaseClient<Database>,
  user: { id: string },
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user,
    workspaceId,
  });

  const handset = await getHandsetLoaderData({
    supabaseClient,
    user,
    workspaceId,
  });

  if (!handset.handsetNumber) {
    return {
      ok: false as const,
      error:
        "No handset-enabled workspace number is available. Enable handset on a number in settings.",
      status: 400,
    };
  }

  return {
    ok: true as const,
    listening: true,
    token: handset.token,
    token_error: handset.tokenError,
    handset_number: handset.handsetNumber,
    client_identity: handset.clientIdentity,
  };
}

export async function stopCallListeningApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  await endHandsetSession({ workspaceId, userId });
  return { ok: true as const, listening: false };
}

export async function getHandsetSessionApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const listening = await loadListeningState(supabaseClient, workspaceId, userId);
  return {
    ok: true as const,
    handset_number: listening.handset_number,
    listening: listening.listening,
  };
}

export async function deleteHandsetSessionApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  await endHandsetSession({ workspaceId, userId });
  return { ok: true as const, success: true };
}

export async function getCampaignCallSessionApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  campaignId: string,
) {
  const { data: campaignRow, error: campaignError } = await supabaseClient
    .from("campaign")
    .select("id, workspace, dial_type, title, status, schedule")
    .eq("id", Number(campaignId))
    .single();

  if (campaignError || !campaignRow || !campaignRow.workspace) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const workspaceId = campaignRow.workspace;
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const {
    workspaceData,
    campaign,
    campaignDetails,
    audiences,
    queueCount,
    completedCount,
    attempts,
  } = await getCallScreenData(supabaseClient, campaignId, workspaceId, userId);

  const twilioData = workspaceData.twilio_data as { sid: string };
  const queue = await getQueueByDialType(
    supabaseClient,
    campaignId,
    campaign.dial_type,
    userId,
  );
  const token = await generateToken({
    twilioAccountSid: twilioData.sid,
    twilioApiKey: workspaceData.key as string,
    twilioApiSecret: workspaceData.token as string,
    identity: userId,
  });
  const verifiedNumbers = await getVerifiedNumbers(supabaseClient, userId);
  const userRole = await getUserRole({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });
  const hasAccess = [MemberRole.Owner, MemberRole.Admin].includes(
    userRole?.role as MemberRole,
  );
  const isActive = campaign ? checkSchedule(campaign) : false;

  return {
    ok: true as const,
    workspace_id: workspaceId,
    campaign,
    campaign_details: campaignDetails,
    audiences,
    queue,
    contacts: queue.map((queueItem) => queueItem.contact),
    next_recipient: getNextRecipient(queue, campaign?.dial_type, userId),
    calls: getInitialCallsList(attempts || []),
    recent_call: getInitialRecentCall(attempts || []),
    recent_attempt: getInitialRecentAttempt(attempts || []),
    token,
    queue_count: queueCount,
    completed_count: completedCount,
    credits: workspaceData.credits,
    is_active: isActive,
    has_access: hasAccess,
    verified_numbers: verifiedNumbers,
  };
}

export async function releaseCampaignCallSessionApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  campaignId: string,
) {
  const { data: campaignRow, error: campaignError } = await supabaseClient
    .from("campaign")
    .select("id, workspace")
    .eq("id", Number(campaignId))
    .single();

  if (campaignError || !campaignRow || !campaignRow.workspace) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const workspaceId = campaignRow.workspace;
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const { data: assignedRows, error: assignedRowsError } = await supabaseClient
    .from("campaign_queue")
    .select("id, status, dequeued_at, assigned_to_user_id")
    .eq("campaign_id", Number(campaignId))
    .is("dequeued_at", null);

  if (assignedRowsError) {
    logger.error("releaseCampaignCallSessionApi queue error", assignedRowsError);
    return { ok: false as const, error: assignedRowsError.message, status: 500 };
  }

  const assignedIds = (assignedRows ?? [])
    .filter((row) => isAssignedToUser(row, userId))
    .map((row) => row.id);

  if (assignedIds.length === 0) {
    return { ok: true as const, released: 0 };
  }

  const update = await supabaseClient
    .from("campaign_queue")
    .update(buildQueuedQueueUpdate())
    .in("id", assignedIds)
    .select("id");

  if (update.error) {
    logger.error("releaseCampaignCallSessionApi update error", update.error);
    return { ok: false as const, error: update.error.message, status: 500 };
  }

  return { ok: true as const, released: update.data?.length ?? 0 };
}

export async function resolveCampaignWorkspaceId(
  supabaseClient: SupabaseClient<Database>,
  campaignId: string | number,
) {
  const { data, error } = await supabaseClient
    .from("campaign")
    .select("workspace")
    .eq("id", Number(campaignId))
    .single();

  if (error || !data) {
    return null;
  }

  return data.workspace;
}

export async function resolveContactWorkspaceId(
  supabaseClient: SupabaseClient<Database>,
  contactId: string | number,
) {
  const { data, error } = await supabaseClient
    .from("campaign_queue")
    .select("campaign!inner(workspace)")
    .eq("contact_id", Number(contactId))
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const campaign = data.campaign as { workspace: string } | null;
  return campaign?.workspace ?? null;
}
