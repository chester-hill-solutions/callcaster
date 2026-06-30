import type { SupabaseClient } from "@supabase/supabase-js";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import {
  getDualAuthSupabase,
  requireJsonAuth,
  verifyApiKeyOrSession,
  type VerifyApiKeyOrSessionResult,
} from "@/lib/api-auth.server";
import {
  getWorkspaceCampaigns,
} from "@/lib/database/campaign.server";
import {
  fetchCampaignData,
  fetchCampaignDetails,
  fetchQueueCounts,
} from "@/lib/database/campaign-stats.server";
import { buildContactSearchWhere } from "@/lib/contacts/search.server";
import { getChatSortOption } from "@/lib/chat-conversation-sort";
import { csvResponse, formatDateUtc, safeFilenamePart, toCsvString } from "@/lib/csv";
import {
  fetchConversationSummary,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import type { Database } from "@/lib/database.types";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import { logger } from "@/lib/logger.server";
import { jsonError } from "@/lib/platform-api.server";
import { parsePagination, type PaginationMeta } from "@/lib/pagination.server";
import {
  deleteAllCampaignQueueForCampaign,
  deleteCampaignQueueByIds,
  updateCampaignQueueStatusByIds,
} from "@/lib/campaign-queue-db.server";
import {
  countCampaignQueueRows,
  countQueuedCampaignQueueRows,
  fetchCampaignQueuePage,
  searchCampaignQueueIds,
} from "@/lib/campaign-queue-search.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import type { QueueSearchFilters } from "@/lib/campaign-queue-search.server";
import type { Campaign } from "@/lib/types";
import type {
  CampaignStatusBody,
  PatchCampaignQueueBody,
} from "@/lib/schemas/api/platform-data";
import {
  loadSurveyDetailByPublicId,
  loadSurveyResponseCounts,
} from "@/lib/survey-db.server";
import {
  audience as audienceTable,
  audience_upload as audienceUploadTable,
  campaign as campaignTable,
  campaign_audience as campaignAudienceTable,
  campaign_queue as campaignQueueTable,
  contact as contactTable,
  contact_audience as contactAudienceTable,
  outreach_attempt as outreachAttemptTable,
  question_option as questionOptionTable,
  response_answer as responseAnswerTable,
  script as scriptTable,
  survey as surveyTable,
  survey_page as surveyPageTable,
  survey_question as surveyQuestionTable,
  survey_response as surveyResponseTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";

const AUDIENCE_CONTACT_SORT_KEYS = [
  "id",
  "firstname",
  "surname",
  "phone",
  "email",
  "created_at",
] as const;

type AudienceContactSortKey = (typeof AUDIENCE_CONTACT_SORT_KEYS)[number];

function audienceContactSortColumn(sortKey: string) {
  if (AUDIENCE_CONTACT_SORT_KEYS.includes(sortKey as AudienceContactSortKey)) {
    return contactTable[sortKey as AudienceContactSortKey];
  }
  return contactTable.id;
}

export type DataPlaneAuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string | null;
};

export type PlatformResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

function emptyQueueFilters(): QueueSearchFilters {
  return {
    name: "",
    phone: "",
    email: "",
    address: "",
    audiences: "",
    disposition: "",
    queueStatus: "",
  };
}

function normalizeQueueFilters(
  filters?: Partial<QueueSearchFilters>,
): QueueSearchFilters {
  return {
    name: filters?.name ?? "",
    phone: filters?.phone ?? "",
    email: filters?.email ?? "",
    address: filters?.address ?? "",
    audiences: filters?.audiences ?? "",
    disposition: filters?.disposition ?? "",
    queueStatus: filters?.queueStatus ?? "",
  };
}

export async function resolveDataPlaneAuth(
  request: Request,
  workspaceId?: string,
): Promise<DataPlaneAuthContext | Response> {
  const auth = await verifyApiKeyOrSession(request);
  if ("error" in auth) {
    return jsonError(auth.error, auth.status);
  }

  const supabase = getDualAuthSupabase(auth);

  if (auth.authType === "api_key") {
    if (workspaceId && auth.workspaceId !== workspaceId) {
      return jsonError("workspaceId does not match API key", 403);
    }
    return { supabase, userId: null };
  }

  if (workspaceId) {
    await requireWorkspaceAccess({
      supabaseClient: supabase,
      user: auth.user,
      workspaceId,
    });
  }

  return { supabase, userId: auth.user.id };
}

async function getCampaignWorkspaceId(
  _supabase: SupabaseClient<Database>,
  campaignId: string,
): Promise<string | null> {
  const rows = await db
    .select({ workspace: campaignTable.workspace })
    .from(campaignTable)
    .where(eq(campaignTable.id, Number(campaignId)))
    .limit(1);
  return rows[0]?.workspace ?? null;
}

async function getContactWorkspaceId(
  _supabase: SupabaseClient<Database>,
  contactId: string,
): Promise<string | null> {
  const rows = await db
    .select({ workspace: contactTable.workspace })
    .from(contactTable)
    .where(eq(contactTable.id, Number(contactId)))
    .limit(1);
  return rows[0]?.workspace ?? null;
}

async function getScriptWorkspaceId(
  _supabase: SupabaseClient<Database>,
  scriptId: string,
): Promise<string | null> {
  const rows = await db
    .select({ workspace: scriptTable.workspace })
    .from(scriptTable)
    .where(eq(scriptTable.id, Number(scriptId)))
    .limit(1);
  return rows[0]?.workspace ?? null;
}

async function getSurveyWorkspaceId(
  _supabase: SupabaseClient<Database>,
  surveyId: string,
): Promise<string | null> {
  const rows = await db
    .select({ workspace: surveyTable.workspace })
    .from(surveyTable)
    .where(eq(surveyTable.survey_id, surveyId))
    .limit(1);
  return rows[0]?.workspace ?? null;
}

export async function authForCampaign(
  request: Request,
  campaignId: string,
): Promise<(DataPlaneAuthContext & { workspaceId: string }) | Response> {
  const auth = await verifyApiKeyOrSession(request);
  if ("error" in auth) {
    return jsonError(auth.error, auth.status);
  }

  const supabase = getDualAuthSupabase(auth);
  const workspaceId = await getCampaignWorkspaceId(supabase, campaignId);
  if (!workspaceId) {
    return jsonError("Campaign not found", 404);
  }

  if (auth.authType === "api_key") {
    if (auth.workspaceId !== workspaceId) {
      return jsonError("Campaign not found", 404);
    }
    return { supabase, userId: null, workspaceId };
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user: auth.user,
    workspaceId,
  });
  return { supabase, userId: auth.user.id, workspaceId };
}

export async function authForContact(
  request: Request,
  contactId: string,
): Promise<(DataPlaneAuthContext & { workspaceId: string }) | Response> {
  const auth = await verifyApiKeyOrSession(request);
  if ("error" in auth) {
    return jsonError(auth.error, auth.status);
  }

  const supabase = getDualAuthSupabase(auth);
  const workspaceId = await getContactWorkspaceId(supabase, contactId);
  if (!workspaceId) {
    return jsonError("Contact not found", 404);
  }

  if (auth.authType === "api_key") {
    if (auth.workspaceId !== workspaceId) {
      return jsonError("Contact not found", 404);
    }
    return { supabase, userId: null, workspaceId };
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user: auth.user,
    workspaceId,
  });
  return { supabase, userId: auth.user.id, workspaceId };
}

export async function authForScript(
  request: Request,
  scriptId: string,
): Promise<(DataPlaneAuthContext & { workspaceId: string }) | Response> {
  const auth = await verifyApiKeyOrSession(request);
  if ("error" in auth) {
    return jsonError(auth.error, auth.status);
  }

  const supabase = getDualAuthSupabase(auth);
  const workspaceId = await getScriptWorkspaceId(supabase, scriptId);
  if (!workspaceId) {
    return jsonError("Script not found", 404);
  }

  if (auth.authType === "api_key") {
    if (auth.workspaceId !== workspaceId) {
      return jsonError("Script not found", 404);
    }
    return { supabase, userId: null, workspaceId };
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user: auth.user,
    workspaceId,
  });
  return { supabase, userId: auth.user.id, workspaceId };
}

export async function authForSurvey(
  request: Request,
  surveyId: string,
): Promise<(DataPlaneAuthContext & { workspaceId: string }) | Response> {
  const auth = await verifyApiKeyOrSession(request);
  if ("error" in auth) {
    return jsonError(auth.error, auth.status);
  }

  const supabase = getDualAuthSupabase(auth);
  const workspaceId = await getSurveyWorkspaceId(supabase, surveyId);
  if (!workspaceId) {
    return jsonError("Survey not found", 404);
  }

  if (auth.authType === "api_key") {
    if (auth.workspaceId !== workspaceId) {
      return jsonError("Survey not found", 404);
    }
    return { supabase, userId: null, workspaceId };
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user: auth.user,
    workspaceId,
  });
  return { supabase, userId: auth.user.id, workspaceId };
}

/** Auth for outreach attempt: session-only, resolves workspace from the attempt row. */
export async function authForOutreachAttempt(
  request: Request,
  outreachAttemptId: number,
): Promise<{ supabase: SupabaseClient<Database>; user: { id: string; email?: string } } | Response> {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const supabase = getDualAuthSupabase(auth as VerifyApiKeyOrSessionResult);
  const rows = await db
    .select({ workspace: outreachAttemptTable.workspace })
    .from(outreachAttemptTable)
    .where(eq(outreachAttemptTable.id, outreachAttemptId))
    .limit(1);
  const attempt = rows[0];

  if (!attempt?.workspace) {
    return jsonError("Outreach attempt not found", 404);
  }

  try {
    await requireWorkspaceAccess({
      supabaseClient: supabase,
      user: (auth as any).user,
      workspaceId: attempt.workspace,
    });
  } catch {
    return jsonError("Forbidden", 403);
  }

  return { supabase, user: (auth as any).user };
}

export async function listWorkspaceCampaignsApi(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
) {
  const { data, error } = await getWorkspaceCampaigns({ supabaseClient: supabase, workspaceId });
  if (error) {
    logger.error("listWorkspaceCampaignsApi", error);
    return { ok: false as const, error: error.message, status: 500 };
  }
  return { ok: true as const, campaigns: data ?? [] };
}

export async function getCampaignDetailApi(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  workspaceId: string,
) {
  const campaign = await fetchCampaignData({ workspaceId, campaignId });
  if (!campaign || campaign.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const queueCounts = await fetchQueueCounts({ workspaceId, campaignId, supabaseClient: supabase });
  let details: unknown = null;
  if (
    campaign.type &&
    campaign.type !== "email" &&
    ["live_call", "message", "robocall", "simple_ivr", "complex_ivr"].includes(
      campaign.type,
    )
  ) {
    details = await fetchCampaignDetails({
      workspaceId,
      campaignId,
    });
  }

  return {
    ok: true as const,
    campaign: {
      ...campaign,
      details,
      queue_counts: queueCounts,
    },
  };
}

export async function duplicateCampaignApi(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  workspaceId: string,
) {
  const campaign = await fetchCampaignData({ workspaceId, campaignId });
  if (!campaign || campaign.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const {
    id: _id,
    created_at: _createdAt,
    campaign_audience: audiences,
    ...rest
  } = campaign;

  const insertPayload = {
    ...rest,
    title: `${campaign.title} (Copy)`,
    status: "draft" as const,
    is_active: false,
  };

  const tdb = createTenantDb(workspaceId);
  let newCampaign: { id: number };
  try {
    const inserted = await tdb.campaign.insert(insertPayload);
    const row = inserted[0];
    if (!row?.id) {
      return {
        ok: false as const,
        error: "Failed to duplicate campaign",
        status: 500,
      };
    }
    newCampaign = { id: row.id };
  } catch (error) {
    logger.error("duplicateCampaignApi insert", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to duplicate campaign",
      status: 500,
    };
  }

  const originalQueue = await db
    .select({ contact_id: campaignQueueTable.contact_id })
    .from(campaignQueueTable)
    .where(eq(campaignQueueTable.campaign_id, Number(campaignId)));

  if (originalQueue.length > 0) {
    try {
      await enqueueContactsForCampaign(
        supabase,
        newCampaign.id,
        originalQueue.map((item) => item.contact_id),
        { requeue: false },
      );
    } catch (error) {
      logger.error("duplicateCampaignApi queue copy", error);
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Failed to copy campaign queue",
        status: 500,
      };
    }
  }

  if (audiences?.length) {
    await db.insert(campaignAudienceTable).values(
      audiences.map((row: { audience_id: number }) => ({
        campaign_id: newCampaign.id,
        audience_id: row.audience_id,
        created_at: new Date().toISOString(),
      })),
    );
  }

  return { ok: true as const, campaign_id: newCampaign.id };
}

export async function transitionCampaignStatusApi(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  workspaceId: string,
  body: CampaignStatusBody,
) {
  const campaignRecord = await fetchCampaignData({ workspaceId, campaignId });
  if (!campaignRecord || campaignRecord.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const { status, is_active } = body;

  if (status === "running" || status === "scheduled") {
    if (
      !campaignRecord.type ||
      !["live_call", "message", "robocall", "simple_ivr", "complex_ivr"].includes(
        campaignRecord.type,
      )
    ) {
      return {
        ok: false as const,
        error: "Campaign type must be selected before updating status",
        status: 400,
      };
    }

    const campaignDetails = await fetchCampaignDetails({ workspaceId, campaignId });
    const queueCounts = await fetchQueueCounts({ workspaceId, campaignId, supabaseClient: supabase });
    const readiness = getCampaignReadiness(
      campaignRecord as Campaign,
      campaignDetails,
      {
        queueCount: queueCounts.queuedCount ?? queueCounts.fullCount ?? 0,
      },
    );
    const readinessError =
      status === "scheduled"
        ? readiness.scheduleDisabledReason
        : readiness.startDisabledReason;

    if (readinessError) {
      return { ok: false as const, error: readinessError, status: 400 };
    }
  }

  const update: Database["public"]["Tables"]["campaign"]["Update"] = {
    status: status as Database["public"]["Enums"]["campaign_status"],
  };
  if (is_active !== undefined) {
    update.is_active = is_active;
  } else if (status === "running") {
    update.is_active = true;
  } else if (status === "paused") {
    update.is_active = false;
  }

  const tdb = createTenantDb(workspaceId);
  try {
    await tdb.campaign.update({
      set: update,
      where: eq(campaignTable.id, Number(campaignId)),
    });
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to update campaign",
      status: 500,
    };
  }

  return { ok: true as const, status, is_active: update.is_active ?? null };
}

export async function getCampaignQueueApi(
  _supabase: SupabaseClient<Database>,
  campaignId: string,
  workspaceId: string,
  searchParams: URLSearchParams,
) {
  const campaign = await fetchCampaignData({ workspaceId, campaignId });
  if (!campaign || campaign.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const { page, pageSize, offset } = parsePagination(searchParams, {
    defaultPageSize: 50,
  });

  const filters = normalizeQueueFilters({
    name: searchParams.get("name") ?? undefined,
    phone: searchParams.get("phone") ?? undefined,
    email: searchParams.get("email") ?? undefined,
    address: searchParams.get("address") ?? undefined,
    audiences: searchParams.get("audiences") ?? undefined,
    disposition: searchParams.get("disposition") ?? undefined,
    queueStatus: searchParams.get("queue_status") ?? undefined,
  });

  const campaignIdNum = Number(campaignId);

  try {
    const [queueResult, unfilteredCount, queuedCount] = await Promise.all([
      fetchCampaignQueuePage({
        campaignId: campaignIdNum,
        filters,
        offset,
        limit: pageSize,
      }),
      countCampaignQueueRows(campaignIdNum),
      countQueuedCampaignQueueRows(campaignIdNum),
    ]);

    return {
      ok: true as const,
      queue: {
        items: queueResult.items,
        pagination: {
          page,
          page_size: pageSize,
          total_count: queueResult.totalCount,
          unfiltered_count: unfilteredCount,
          queued_count: queuedCount,
        } satisfies PaginationMeta,
        filters,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load campaign queue",
      status: 500,
    };
  }
}

export async function patchCampaignQueueApi(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  workspaceId: string,
  body: PatchCampaignQueueBody,
) {
  const campaign = await fetchCampaignData({ workspaceId, campaignId });
  if (!campaign || campaign.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const filters = normalizeQueueFilters(body.filters);
  const campaignIdNum = Number(campaignId);

  try {
    switch (body.action) {
      case "update_status": {
        if (body.all) {
          const ids = await searchCampaignQueueIds({ campaignId: campaignIdNum, filters });
          await updateCampaignQueueStatusByIds(ids, body.status!);
        } else if (body.ids?.length) {
          await updateCampaignQueueStatusByIds(body.ids, body.status!);
        }
        return { ok: true as const, success: true };
      }
      case "add_contact_ids": {
        await enqueueContactsForCampaign(
          supabase,
          campaignIdNum,
          body.contact_ids!,
          { requeue: false },
        );
        return { ok: true as const, success: true };
      }
      case "add_audience": {
        const contacts = await db
          .select({ contact_id: contactAudienceTable.contact_id })
          .from(contactAudienceTable)
          .where(eq(contactAudienceTable.audience_id, body.audience_id!));
        await enqueueContactsForCampaign(
          supabase,
          campaignIdNum,
          contacts.map((row) => row.contact_id),
          { requeue: false },
        );
        return { ok: true as const, success: true };
      }
      case "remove": {
        if (body.all) {
          await deleteAllCampaignQueueForCampaign(campaignIdNum);
        } else if (body.ids?.length) {
          await deleteCampaignQueueByIds(body.ids);
        }
        return { ok: true as const, success: true };
      }
      default: {
        const _exhaustive: never = body.action;
        return { ok: false as const, error: "Invalid action", status: 400 };
      }
    }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to update campaign queue",
      status: 500,
    };
  }
}

export async function listWorkspaceContactsApi(
  _supabase: SupabaseClient<Database>,
  workspaceId: string,
  searchParams: URLSearchParams,
) {
  const rawSearchQuery = searchParams.get("q") ?? "";
  const searchQuery = rawSearchQuery.trim().replaceAll(",", " ");
  const { page, pageSize, offset } = parsePagination(searchParams, {
    defaultPageSize: 20,
  });

  const tdb = createTenantDb(workspaceId);
  const searchWhere = searchQuery ? buildContactSearchWhere(searchQuery) : undefined;

  try {
    const [totalCount, contacts] = await Promise.all([
      tdb.contact.count({ where: searchWhere }),
      tdb.contact.findMany({
        where: searchWhere,
        columns: {
          id: true,
          firstname: true,
          surname: true,
          phone: true,
          email: true,
          address: true,
          city: true,
          other_data: true,
          created_at: true,
        },
        orderBy: (contact, { desc: descFn }) => [descFn(contact.created_at)],
        limit: pageSize,
        offset,
      }),
    ]);

    return {
      ok: true as const,
      contacts,
      pagination: {
        page,
        page_size: pageSize,
        total_count: totalCount,
        total_pages: Math.ceil(totalCount / pageSize),
      } satisfies PaginationMeta,
      search_query: searchQuery || null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load contacts";
    return { ok: false as const, error: message, status: 500 };
  }
}

export async function getContactDetailApi(
  _supabase: SupabaseClient<Database>,
  contactId: string,
  workspaceId: string,
) {
  const tdb = createTenantDb(workspaceId);
  const contactIdNum = Number(contactId);

  try {
    const contactRow = await tdb.contact.findFirst({
      where: eq(contactTable.id, contactIdNum),
    });
    if (!contactRow) {
      return { ok: false as const, error: "Contact not found", status: 404 };
    }

    const [attemptRows, audienceLinks] = await Promise.all([
      tdb.outreach_attempt.findMany({
        where: eq(outreachAttemptTable.contact_id, contactIdNum),
      }),
      db
        .select()
        .from(contactAudienceTable)
        .where(eq(contactAudienceTable.contact_id, contactIdNum)),
    ]);

    const campaignIds = [
      ...new Set(
        attemptRows
          .map((attempt) => attempt.campaign_id)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];
    const campaigns =
      campaignIds.length > 0
        ? await tdb.campaign.findMany({
            where: inArray(campaignTable.id, campaignIds),
          })
        : [];
    const campaignById = new Map(campaigns.map((row) => [row.id, row]));

    return {
      ok: true as const,
      contact: {
        ...contactRow,
        outreach_attempt: attemptRows.map((attempt) => ({
          ...attempt,
          campaign: attempt.campaign_id
            ? (campaignById.get(attempt.campaign_id) ?? null)
            : null,
        })),
        contact_audience: audienceLinks,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Contact not found",
      status: 500,
    };
  }
}

export async function deleteContactApi(
  _supabase: SupabaseClient<Database>,
  contactId: string,
  workspaceId: string,
) {
  const tdb = createTenantDb(workspaceId);
  const contactIdNum = Number(contactId);

  try {
    const contactRow = await tdb.contact.findFirst({
      where: eq(contactTable.id, contactIdNum),
      columns: { id: true },
    });
    if (!contactRow) {
      return { ok: false as const, error: "Contact not found", status: 404 };
    }

    await tdb.contact.delete({ where: eq(contactTable.id, contactIdNum) });
    return { ok: true as const, success: true, contact_id: contactIdNum };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to delete contact",
      status: 500,
    };
  }
}

export async function listWorkspaceAudiencesApi(
  _supabase: SupabaseClient<Database>,
  workspaceId: string,
) {
  const tdb = createTenantDb(workspaceId);

  try {
    const audiences = await tdb.audience.findMany({
      orderBy: (audience, { desc: descFn }) => [descFn(audience.created_at)],
    });
    return { ok: true as const, audiences };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load audiences",
      status: 500,
    };
  }
}

export async function getAudienceDetailApi(
  _supabase: SupabaseClient<Database>,
  workspaceId: string,
  audienceId: string,
  searchParams: URLSearchParams,
) {
  const { page, pageSize, offset } = parsePagination(searchParams, {
    defaultPageSize: 50,
  });
  const sortKey = searchParams.get("sort_key") || "id";
  const sortDirection = searchParams.get("sort_direction") === "desc" ? "desc" : "asc";
  const audienceIdNum = Number(audienceId);
  const sortColumn = audienceContactSortColumn(sortKey);
  const tdb = createTenantDb(workspaceId);

  try {
    const audience = await tdb.audience.findFirst({
      where: eq(audienceTable.id, audienceIdNum),
    });
    if (!audience) {
      return { ok: false as const, error: "Audience not found", status: 404 };
    }

    const audienceContactFilter = and(
      eq(contactAudienceTable.audience_id, audienceIdNum),
      eq(contactTable.workspace, workspaceId),
    );

    const [contactRows, countRows, latestUpload] = await Promise.all([
      db
        .select({ contact: contactTable })
        .from(contactAudienceTable)
        .innerJoin(contactTable, eq(contactAudienceTable.contact_id, contactTable.id))
        .where(audienceContactFilter)
        .orderBy(sortDirection === "asc" ? asc(sortColumn) : desc(sortColumn))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: count() })
        .from(contactAudienceTable)
        .innerJoin(contactTable, eq(contactAudienceTable.contact_id, contactTable.id))
        .where(audienceContactFilter),
      tdb.audience_upload.findFirst({
        where: eq(audienceUploadTable.audience_id, audienceIdNum),
        orderBy: (upload, { desc: descFn }) => [descFn(upload.created_at)],
      }),
    ]);

    return {
      ok: true as const,
      audience,
      contacts: contactRows.map((row) => ({ contact: row.contact })),
      pagination: {
        page,
        page_size: pageSize,
        total_count: countRows[0]?.value ?? 0,
      } satisfies PaginationMeta,
      sorting: { sort_key: sortKey, sort_direction: sortDirection },
      latest_upload: latestUpload
        ? {
            id: latestUpload.id,
            status: latestUpload.status ?? "unknown",
            progress:
              latestUpload.processed_contacts && latestUpload.total_contacts
                ? Math.round(
                    (latestUpload.processed_contacts / latestUpload.total_contacts) * 100,
                  )
                : 0,
            total_contacts: latestUpload.total_contacts ?? 0,
            processed_contacts: latestUpload.processed_contacts ?? 0,
            error_message: latestUpload.error_message,
          }
        : null,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load audience",
      status: 500,
    };
  }
}

export async function listWorkspaceScriptsApi(
  _supabase: SupabaseClient<Database>,
  workspaceId: string,
) {
  const tdb = createTenantDb(workspaceId);

  try {
    const scripts = await tdb.script.findMany({
      orderBy: (script, { desc: descFn }) => [descFn(script.updated_at)],
    });
    return { ok: true as const, scripts };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load scripts",
      status: 500,
    };
  }
}

export async function getScriptDetailApi(
  _supabase: SupabaseClient<Database>,
  scriptId: string,
  workspaceId: string,
) {
  const tdb = createTenantDb(workspaceId);

  try {
    const script = await tdb.script.findFirst({
      where: eq(scriptTable.id, Number(scriptId)),
    });
    if (!script) {
      return { ok: false as const, error: "Script not found", status: 404 };
    }
    return { ok: true as const, script };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Script not found",
      status: 500,
    };
  }
}

export async function listWorkspaceSurveysApi(
  _supabase: SupabaseClient<Database>,
  workspaceId: string,
) {
  const tdb = createTenantDb(workspaceId);

  try {
    const surveys = await tdb.survey.findMany({
      orderBy: (survey, { desc: descFn }) => [descFn(survey.created_at)],
    });
    const responseCounts = await loadSurveyResponseCounts(surveys.map((survey) => survey.id));

    return {
      ok: true as const,
      surveys: surveys.map((survey) => ({
        ...survey,
        survey_response: [{ count: responseCounts.get(survey.id) ?? 0 }],
      })),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load surveys",
      status: 500,
    };
  }
}

export async function getSurveyDetailApi(
  _supabase: SupabaseClient<Database>,
  surveyId: string,
  workspaceId: string,
) {
  try {
    const survey = await loadSurveyDetailByPublicId(surveyId, { workspaceId });
    if (!survey) {
      return { ok: false as const, error: "Survey not found", status: 404 };
    }
    return { ok: true as const, survey };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Survey not found",
      status: 500,
    };
  }
}

export async function getSurveyResponsesApi(
  _supabase: SupabaseClient<Database>,
  surveyId: string,
  workspaceId: string,
) {
  const tdb = createTenantDb(workspaceId);

  try {
    const survey = await tdb.survey.findFirst({
      where: eq(surveyTable.survey_id, surveyId),
      columns: {
        id: true,
        survey_id: true,
        title: true,
        workspace: true,
      },
    });
    if (!survey) {
      return { ok: false as const, error: "Survey not found", status: 404 };
    }

    const responseRows = await db
      .select()
      .from(surveyResponseTable)
      .where(eq(surveyResponseTable.survey_id, survey.id))
      .orderBy(desc(surveyResponseTable.created_at));

    if (responseRows.length === 0) {
      return {
        ok: true as const,
        survey_id: survey.survey_id,
        responses: [],
        stats: {
          total: 0,
          completed: 0,
          in_progress: 0,
          completion_rate: 0,
        },
      };
    }

    const responseIds = responseRows.map((response) => response.id);
    const contactIds = [
      ...new Set(
        responseRows
          .map((response) => response.contact_id)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];

    const pages = await db
      .select({ id: surveyPageTable.id })
      .from(surveyPageTable)
      .where(eq(surveyPageTable.survey_id, survey.id));
    const pageIds = pages.map((page) => page.id);
    const questions =
      pageIds.length === 0
        ? []
        : await db
            .select()
            .from(surveyQuestionTable)
            .where(inArray(surveyQuestionTable.page_id, pageIds));
    const questionIds = questions.map((question) => question.id);

    const [contacts, answerRows, options] = await Promise.all([
      contactIds.length > 0
        ? db
            .select({
              id: contactTable.id,
              firstname: contactTable.firstname,
              surname: contactTable.surname,
              phone: contactTable.phone,
              email: contactTable.email,
            })
            .from(contactTable)
            .where(
              and(
                eq(contactTable.workspace, workspaceId),
                inArray(contactTable.id, contactIds),
              ),
            )
        : Promise.resolve([]),
      db
        .select()
        .from(responseAnswerTable)
        .where(inArray(responseAnswerTable.response_id, responseIds)),
      questionIds.length === 0
        ? Promise.resolve([])
        : db
            .select()
            .from(questionOptionTable)
            .where(inArray(questionOptionTable.question_id, questionIds)),
    ]);

    const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const optionsByQuestionId = new Map<number, typeof options>();
    for (const option of options) {
      const existing = optionsByQuestionId.get(option.question_id) ?? [];
      existing.push(option);
      optionsByQuestionId.set(option.question_id, existing);
    }

    const answersByResponseId = new Map<number, Array<(typeof answerRows)[number] & {
      survey_question: {
        question_id: string;
        question_text: string;
        question_type: string;
        question_option: Array<{ option_label: string }>;
      } | null;
    }>>();

    for (const answer of answerRows) {
      const question = questionById.get(answer.question_id);
      const enrichedAnswer = {
        ...answer,
        survey_question: question
          ? {
              question_id: question.question_id,
              question_text: question.question_text,
              question_type: question.question_type,
              question_option: (optionsByQuestionId.get(question.id) ?? []).map(
                (option) => ({ option_label: option.option_label }),
              ),
            }
          : null,
      };
      const existing = answersByResponseId.get(answer.response_id) ?? [];
      existing.push(enrichedAnswer);
      answersByResponseId.set(answer.response_id, existing);
    }

    const responses = responseRows.map((response) => ({
      ...response,
      contact: response.contact_id
        ? (contactById.get(response.contact_id) ?? null)
        : null,
      response_answer: answersByResponseId.get(response.id) ?? [],
    }));

    const total = responses.length;
    const completed = responses.filter((row) => row.completed_at)?.length ?? 0;

    return {
      ok: true as const,
      survey_id: survey.survey_id,
      responses,
      stats: {
        total,
        completed,
        in_progress: total - completed,
        completion_rate: total > 0 ? (completed / total) * 100 : 0,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load survey responses",
      status: 500,
    };
  }
}

export async function exportSurveyResponsesCsv(
  supabase: SupabaseClient<Database>,
  surveyId: string,
  workspaceId: string,
): Promise<PlatformResult<Response>> {
  const result = await getSurveyResponsesApi(supabase, surveyId, workspaceId);
  if (!result.ok) {
    return result;
  }

  let survey;
  try {
    survey = await loadSurveyDetailByPublicId(surveyId, { workspaceId });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Survey not found",
      status: 500,
    };
  }

  if (!survey) {
    return { ok: false, error: "Survey not found", status: 404 };
  }

  type SurveyPageWithQuestions = {
    page_order?: number;
    survey_question?: Array<{
      id: number;
      question_id: string;
      question_text: string;
      question_type: string;
      question_order: number;
    }>;
  };

  const allQuestions = ((survey.survey_page ?? []) as SurveyPageWithQuestions[])
    .flatMap((page) => page.survey_question ?? [])
    .sort((a, b) => (a.question_order ?? 0) - (b.question_order ?? 0));

  type ResponseRow = (typeof result.responses)[number];

  const formatAnswer = (answer: ResponseRow["response_answer"][number] | undefined) => {
    if (!answer) return "-";
    if (answer.survey_question?.question_type === "checkbox") {
      try {
        const values = JSON.parse(answer.answer_value) as unknown;
        return Array.isArray(values) ? values.join(", ") : answer.answer_value;
      } catch {
        return answer.answer_value;
      }
    }
    return answer.answer_value;
  };

  const getContactName = (response: ResponseRow) => {
    if (response.contact?.firstname && response.contact?.surname) {
      return `${response.contact.firstname} ${response.contact.surname}`;
    }
    if (response.contact?.phone) return response.contact.phone;
    if (response.contact?.email) return response.contact.email;
    return "Anonymous";
  };

  const getAnswerForQuestion = (response: ResponseRow, questionId: string) => {
    const question = allQuestions.find((q) => q.question_id === questionId);
    if (!question) return "-";
    const answer = response.response_answer?.find((a) => a.question_id === question.id);
    return answer ? formatAnswer(answer) : "-";
  };

  const headers = [
    "Respondent",
    "Status",
    "Started",
    "Completed",
    "Last Page",
    ...allQuestions.map((question) => question.question_text),
  ];

  const rows = result.responses.map((response) => [
    getContactName(response),
    response.completed_at ? "Completed" : "In Progress",
    formatDateUtc(response.started_at),
    response.completed_at ? formatDateUtc(response.completed_at) : "-",
    response.last_page_completed || "-",
    ...allQuestions.map((question) =>
      getAnswerForQuestion(response, question.question_id),
    ),
  ]);

  const headerKeys = headers.map((_, idx) => `c${idx}`);
  const csvRows = rows.map((row) =>
    Object.fromEntries(row.map((cell, idx) => [`c${idx}`, cell])),
  );
  const csv = toCsvString({
    headers: headerKeys,
    headerLabels: headers,
    rows: csvRows,
  });

  const filename = `survey-responses-${safeFilenamePart(String(survey.title ?? "survey"))}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return {
    ok: true,
    data: csvResponse({ filename, csv }),
  };
}

export async function listWorkspaceConversationsApi(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  searchParams: URLSearchParams,
) {
  const campaignId = searchParams.get("campaign_id");
  const sortBy = getChatSortOption(searchParams.get("sort"));
  const { page, pageSize, offset } = parsePagination(searchParams, {
    defaultPageSize: 20,
    minPageSize: 10,
  });

  const { chats, chatsError, hasMore } = await fetchConversationSummary(
    supabase,
    workspaceId,
    campaignId,
    { limit: pageSize, offset, sort: sortBy },
  );

  if (chatsError) {
    const message =
      typeof chatsError === "object" && chatsError !== null && "message" in chatsError
        ? String(chatsError.message)
        : "Failed to load conversations";
    return { ok: false as const, error: message, status: 500 };
  }

  return {
    ok: true as const,
    conversations: chats ?? [],
    pagination: { page, page_size: pageSize, has_more: hasMore } satisfies PaginationMeta,
  };
}

export async function getConversationMessagesApi(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  contactNumber: string,
  searchParams: URLSearchParams,
) {
  const before = searchParams.get("before");
  const result = await fetchMessagePage({
    supabaseClient: supabase,
    workspaceId,
    contactFilter: contactNumber,
    before,
  });

  return {
    ok: true as const,
    contact_number: contactNumber,
    messages: result.messages,
    has_more: result.hasMore,
  };
}

export async function getAudienceUploadStatusApi(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  uploadId: string,
) {
  const parsedUploadId = Number.parseInt(uploadId, 10);
  if (Number.isNaN(parsedUploadId)) {
    return { ok: false as const, error: "Invalid upload ID", status: 400 };
  }

  const tdb = createTenantDb(workspaceId);
  let uploadData;
  try {
    uploadData = await tdb.audience_upload.findFirst({
      where: eq(audienceUploadTable.id, parsedUploadId),
    });
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Upload not found",
      status: 500,
    };
  }

  if (!uploadData) {
    return { ok: false as const, error: "Upload not found", status: 404 };
  }

  let statusFileData: Record<string, unknown> = {};
  const { data: statusData, error: statusError } = await supabase.storage
    .from("audience-uploads")
    .download(`${workspaceId}/${parsedUploadId}.json`);

  if (!statusError && statusData) {
    try {
      statusFileData = JSON.parse(await statusData.text()) as Record<string, unknown>;
    } catch (error) {
      logger.error("getAudienceUploadStatusApi parse status file", error);
    }
  }

  return {
    ok: true as const,
    upload: {
      upload_id: uploadData.id,
      audience_id: uploadData.audience_id,
      status: uploadData.status,
      file_name: uploadData.file_name,
      file_size: uploadData.file_size,
      total_contacts: uploadData.total_contacts,
      processed_contacts: uploadData.processed_contacts,
      error_message: uploadData.error_message,
      stage:
        typeof statusFileData.stage === "string"
          ? statusFileData.stage
          : uploadData.status === "completed"
            ? "Upload completed"
            : uploadData.status === "error"
              ? "Upload failed"
              : "Processing contacts",
      ...statusFileData,
    },
  };
}

export { emptyQueueFilters };
