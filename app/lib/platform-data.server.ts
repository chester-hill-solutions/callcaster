import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
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
import { fetchMessagePage } from "@/lib/chats/fetch-message-page.server";
import { getChatSortOption } from "@/lib/chat-conversation-sort";
import { csvResponse, formatDateUtc, safeFilenamePart, toCsvString } from "@/lib/csv";
import {
  fetchConversationSummary,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import type { Database } from "@/lib/db-types";
import { AppError } from "@/lib/errors.server";
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
  buildSurveyResponsesCsv,
  getSurveyResponsesForWorkspace,
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
import { downloadObject } from "@/lib/object-storage.server";

export { getAudienceDetailApi } from "./audience-detail.server";

export type DataPlaneApiKeyAuth = {
  keyId: string;
  scopes: readonly string[];
};

export type DataPlaneAuthContext = {
  userId: string | null;
  /** Present when authenticated via workspace API key. */
  apiKey?: DataPlaneApiKeyAuth;
};

export type PlatformResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

function emptyQueueFilters(): QueueSearchFilters {
  return {
    name: "", phone: "", email: "", address: "",
    audiences: "", disposition: "", queueStatus: "",
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
  if (auth.authType === "api_key") {
    if (workspaceId && auth.workspaceId !== workspaceId) {
      return jsonError("Workspace not found", 404);
    }
    return {
      userId: null,
      apiKey: { keyId: auth.keyId, scopes: auth.scopes },
    };
  }

  if (workspaceId) {
    try {
      await requireWorkspaceAccess({
        user: auth.user,
        workspaceId,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return jsonError(error.message, error.statusCode);
      }
      throw error;
    }
  }

  return { userId: auth.user.id };
}

export type PlatformResourceKind =
  | "campaign"
  | "contact"
  | "script"
  | "survey"
  | "outreach_attempt";

const RESOURCE_NOT_FOUND: Record<PlatformResourceKind, string> = {
  campaign: "Campaign not found",
  contact: "Contact not found",
  script: "Script not found",
  survey: "Survey not found",
  outreach_attempt: "Outreach attempt not found",
};

export async function resolveResourceWorkspaceId(
  kind: PlatformResourceKind,
  id: string | number,
): Promise<string | null> {
  switch (kind) {
    case "campaign": {
      const rows = await db
        .select({ workspace: campaignTable.workspace })
        .from(campaignTable)
        .where(eq(campaignTable.id, Number(id)))
        .limit(1);
      return rows[0]?.workspace ?? null;
    }
    case "contact": {
      const rows = await db
        .select({ workspace: contactTable.workspace })
        .from(contactTable)
        .where(eq(contactTable.id, Number(id)))
        .limit(1);
      return rows[0]?.workspace ?? null;
    }
    case "script": {
      const rows = await db
        .select({ workspace: scriptTable.workspace })
        .from(scriptTable)
        .where(eq(scriptTable.id, Number(id)))
        .limit(1);
      return rows[0]?.workspace ?? null;
    }
    case "survey": {
      const rows = await db
        .select({ workspace: surveyTable.workspace })
        .from(surveyTable)
        .where(eq(surveyTable.survey_id, String(id)))
        .limit(1);
      return rows[0]?.workspace ?? null;
    }
    case "outreach_attempt": {
      const rows = await db
        .select({ workspace: outreachAttemptTable.workspace })
        .from(outreachAttemptTable)
        .where(eq(outreachAttemptTable.id, Number(id)))
        .limit(1);
      return rows[0]?.workspace ?? null;
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Membership + min-role gate for session (member) data-plane auth. Reuses
 * `requireWorkspaceAccess` (single role lookup) and converts its thrown
 * `AppError` into a JSON `Response` so callers can `return` it — matching the
 * rest of this module. Returns `null` when access is allowed.
 *
 * `minRole` is undefined for read paths (any member/caller) and `"member"` for
 * destructive mutations, blocking the lowest `caller` role.
 */
async function enforceWorkspaceRole(
  user: { id: string },
  workspaceId: string,
  minRole?: string,
): Promise<Response | null> {
  try {
    await requireWorkspaceAccess({ user, workspaceId, minRole });
    return null;
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    throw error;
  }
}

export async function authForResource(
  request: Request,
  kind: PlatformResourceKind,
  id: string | number,
  minRole?: string,
): Promise<(DataPlaneAuthContext & { workspaceId: string }) | Response> {
  if (kind === "outreach_attempt") {
    const auth = await requireJsonAuth(request);
    if (auth instanceof Response) return auth;

    const workspaceId = await resolveResourceWorkspaceId(kind, id);
    if (!workspaceId) {
      return jsonError(RESOURCE_NOT_FOUND[kind], 404);
    }

    try {
      await requireWorkspaceAccess({
        user: auth.user,
        workspaceId,
        minRole,
      });
    } catch {
      return jsonError("Forbidden", 403);
    }

    return { userId: auth.user.id, workspaceId };
  }

  const auth = await verifyApiKeyOrSession(request);
  if ("error" in auth) {
    return jsonError(auth.error, auth.status);
  }

  const workspaceId = await resolveResourceWorkspaceId(kind, id);
  if (!workspaceId) {
    return jsonError(RESOURCE_NOT_FOUND[kind], 404);
  }

  if (auth.authType === "api_key") {
    if (auth.workspaceId !== workspaceId) {
      return jsonError(RESOURCE_NOT_FOUND[kind], 404);
    }
    // Capability gates are applied by route handlers via requireDataPlaneCapability.
    return {
      userId: null,
      workspaceId,
      apiKey: { keyId: auth.keyId, scopes: auth.scopes },
    };
  }

  const denied = await enforceWorkspaceRole(auth.user, workspaceId, minRole);
  if (denied) return denied;
  return { userId: auth.user.id, workspaceId };
}

export async function listWorkspaceCampaignsApi(
    workspaceId: string,
) {
  const { data, error } = await getWorkspaceCampaigns({ workspaceId });
  if (error) {
    logger.error("listWorkspaceCampaignsApi", error);
    return { ok: false as const, error: error.message, status: 500 };
  }
  return { ok: true as const, campaigns: data ?? [] };
}

export async function getCampaignDetailApi(
    campaignId: string,
  workspaceId: string,
) {
  const campaign = await fetchCampaignData({ workspaceId, campaignId });
  if (!campaign || campaign.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const queueCounts = await fetchQueueCounts({ workspaceId, campaignId });
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
    const queueCounts = await fetchQueueCounts({ workspaceId, campaignId });
    const readiness = getCampaignReadiness(
      campaignRecord as Campaign,
      campaignDetails as Parameters<typeof getCampaignReadiness>[1],
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
  _request: Request,
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
          const ids = await searchCampaignQueueIds({
            campaignId: campaignIdNum,
            filters,
            workspaceId,
          });
          await updateCampaignQueueStatusByIds(ids, body.status!, workspaceId);
        } else if (body.ids?.length) {
          await updateCampaignQueueStatusByIds(body.ids, body.status!, workspaceId);
        }
        return { ok: true as const, success: true };
      }
      case "add_contact_ids": {
        await enqueueContactsForCampaign(
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
          campaignIdNum,
          contacts.map((row) => row.contact_id),
          { requeue: false },
        );
        return { ok: true as const, success: true };
      }
      case "remove": {
        if (body.all) {
          await deleteAllCampaignQueueForCampaign(campaignIdNum, workspaceId);
        } else if (body.ids?.length) {
          await deleteCampaignQueueByIds(body.ids, workspaceId);
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

export async function listWorkspaceScriptsApi(
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
  surveyId: string,
  workspaceId: string,
) {
  return getSurveyResponsesForWorkspace(surveyId, workspaceId);
}

export async function exportSurveyResponsesCsv(
  surveyId: string,
  workspaceId: string,
): Promise<PlatformResult<Response>> {
  const result = await buildSurveyResponsesCsv({ workspaceId, surveyId });
  if (!result.ok) {
    return result;
  }
  return { ok: true as const, data: csvResponse({ filename: result.filename, csv: result.csv }) };
}

export async function listWorkspaceConversationsApi(
    workspaceId: string,
  searchParams: URLSearchParams,
) {
  const campaignId = searchParams.get("campaign_id");
  const search = searchParams.get("search") ?? undefined;
  const sortBy = getChatSortOption(searchParams.get("sort"));
  const { page, pageSize, offset } = parsePagination(searchParams, {
    defaultPageSize: 20,
    minPageSize: 10,
  });

  const { chats, chatsError, hasMore } = await fetchConversationSummary(
    workspaceId,
    campaignId,
    { limit: pageSize, offset, sort: sortBy, search },
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
    workspaceId: string,
  contactNumber: string,
  searchParams: URLSearchParams,
) {
  const before = searchParams.get("before");
  const result = await fetchMessagePage({
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
  try {
    const statusData = await downloadObject("audience-uploads", `${workspaceId}/${parsedUploadId}.json`);
    statusFileData = JSON.parse(statusData.toString("utf-8")) as Record<string, unknown>;
  } catch (error) {
    // Object may not exist; that's okay
    logger.error("getAudienceUploadStatusApi download status file", error);
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
