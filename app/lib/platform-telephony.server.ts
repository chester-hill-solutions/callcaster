import { and, eq, gt } from "drizzle-orm";
import { checkSchedule, getHandsetNumberForWorkspace, getUserRole, requireWorkspaceAccess } from "@/lib/database.server";
import { findCampaignById } from "@/lib/campaign-audience-db.server";
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
import type { Database } from "@/lib/db-types";
import { resolveContactWorkspaceIdFromQueue } from "@/lib/campaign-queue-db.server";
import { handset_session as handsetSessionTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { MemberRole } from "@/lib/member-role";
import { generateToken } from "@/lib/twilio-token.server";
import { releaseAssignedQueueForUser } from "@/lib/queue-status";
import { logger } from "@/lib/logger.server";

const EMPTY_LISTENING = {
  active: false,
  token: null,
  token_error: null,
} as const;

export async function getWorkspaceCallLogApi(
  userId: string,
  workspaceId: string,
  requestUrl: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const callLog = await loadCallLogPage({
    workspaceId,
    requestUrl,
  });

  return { ok: true as const, ...callLog };
}

async function loadListeningState(
  workspaceId: string,
  userId: string,
) {
  const { data: handsetData } = await getHandsetNumberForWorkspace({
    workspaceId,
  });
  const handsetNumber = handsetData?.phone_number ?? null;
  const now = new Date().toISOString();
  const tdb = createTenantDb(workspaceId);
  const session = await tdb.handset_session.findFirst({
    where: and(
      eq(handsetSessionTable.user_id, userId),
      eq(handsetSessionTable.status, "active"),
      gt(handsetSessionTable.expires_at, now),
    ),
    columns: { client_identity: true },
    orderBy: (row, { desc: descFn }) => [descFn(row.created_at)],
  });

  if (!session?.client_identity) {
    return {
      handset_number: handsetNumber,
      listening: { ...EMPTY_LISTENING },
    };
  }

  const tokenResult = await createHandsetAccessToken({
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
  user: { id: string },
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user,
    workspaceId,
  });

  const handset = await getHandsetLoaderData({
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
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  await endHandsetSession({ workspaceId, userId });
  return { ok: true as const, listening: false };
}

export async function getHandsetSessionApi(
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const listening = await loadListeningState(workspaceId, userId);
  return {
    ok: true as const,
    handset_number: listening.handset_number,
    listening: listening.listening,
  };
}

export async function deleteHandsetSessionApi(
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  await endHandsetSession({ workspaceId, userId });
  return { ok: true as const, success: true };
}

export async function getCampaignCallSessionApi(
  userId: string,
  campaignId: string,
) {
  const campaignRow = await findCampaignById(Number(campaignId));

  if (!campaignRow?.workspace) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const workspaceId = campaignRow.workspace;
  await requireWorkspaceAccess({
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
  } = await getCallScreenData(campaignId, workspaceId, userId);

  const twilioData = workspaceData.twilio_data as { sid: string };
  const queue = await getQueueByDialType(
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
  const verifiedNumbers = await getVerifiedNumbers(userId);
  const userRole = await getUserRole({
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
  userId: string,
  campaignId: string,
) {
  const workspaceId = await resolveCampaignWorkspaceId(campaignId);

  if (!workspaceId) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const result = await releaseAssignedQueueForUser(userId,
    campaignId,
  );

  if (!result.ok) {
    logger.error("releaseCampaignCallSessionApi queue error", result.error);
    return { ok: false as const, error: result.error, status: 500 };
  }

  return { ok: true as const, released: result.released };
}

export async function resolveCampaignWorkspaceId(
  campaignId: string | number,
) {
  const row = await findCampaignById(Number(campaignId));
  return row?.workspace ?? null;
}

export async function resolveContactWorkspaceId(
  contactId: string | number,
) {
  return resolveContactWorkspaceIdFromQueue(Number(contactId));
}
