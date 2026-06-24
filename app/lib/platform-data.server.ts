import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCampaignTableKey,
  getWorkspaceCampaigns,
} from "@/lib/database/campaign.server";
import {
  fetchCampaignData,
  fetchCampaignDetails,
  fetchQueueCounts,
} from "@/lib/database/campaign-stats.server";
import { buildContactSearchFilter } from "@/lib/contacts/search.server";
import { getChatSortOption } from "@/lib/chat-conversation-sort";
import { csvResponse, toCsvString } from "@/lib/csv";
import {
  fetchConversationSummary,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import type { Database } from "@/lib/database.types";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import { logger } from "@/lib/logger.server";
import { jsonError } from "@/lib/platform-api.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import {
  filteredSearch,
  type QueueSearchFilters,
} from "@/lib/queue-filter-search.server";
import { QUEUE_STATUS_QUEUED } from "@/lib/queue-status";
import {
  verifyApiKeyOrSession,
  type VerifyApiKeyOrSessionResult,
} from "@/lib/api-auth.server";
import type { Campaign } from "@/lib/types";
import type {
  CampaignStatusBody,
  PatchCampaignQueueBody,
} from "@/lib/schemas/api/platform-data";
import { fetchMessagePage } from "@/lib/chats/fetch-message-page.server";

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

  const supabase = getSupabaseFromAuth(auth);

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

function getSupabaseFromAuth(
  auth: Exclude<VerifyApiKeyOrSessionResult, { error: string; status: 401 }>,
): SupabaseClient<Database> {
  return auth.authType === "api_key" ? auth.supabase : auth.supabaseClient;
}

export async function requireResourceWorkspaceAccess(
  request: Request,
  workspaceId: string,
): Promise<DataPlaneAuthContext | Response> {
  return resolveDataPlaneAuth(request, workspaceId);
}

async function getCampaignWorkspaceId(
  supabase: SupabaseClient<Database>,
  campaignId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("campaign")
    .select("workspace")
    .eq("id", Number(campaignId))
    .maybeSingle();
  return data?.workspace ?? null;
}

async function getContactWorkspaceId(
  supabase: SupabaseClient<Database>,
  contactId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("contact")
    .select("workspace")
    .eq("id", Number(contactId))
    .maybeSingle();
  return data?.workspace ?? null;
}

async function getScriptWorkspaceId(
  supabase: SupabaseClient<Database>,
  scriptId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("script")
    .select("workspace")
    .eq("id", Number(scriptId))
    .maybeSingle();
  return data?.workspace ?? null;
}

async function getSurveyWorkspaceId(
  supabase: SupabaseClient<Database>,
  surveyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("survey")
    .select("workspace")
    .eq("survey_id", surveyId)
    .maybeSingle();
  return data?.workspace ?? null;
}

export async function authForCampaign(
  request: Request,
  campaignId: string,
): Promise<(DataPlaneAuthContext & { workspaceId: string }) | Response> {
  const auth = await verifyApiKeyOrSession(request);
  if ("error" in auth) {
    return jsonError(auth.error, auth.status);
  }

  const supabase = getSupabaseFromAuth(auth);
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

  const supabase = getSupabaseFromAuth(auth);
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

  const supabase = getSupabaseFromAuth(auth);
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

  const supabase = getSupabaseFromAuth(auth);
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
  const campaign = await fetchCampaignData(supabase, campaignId);
  if (!campaign || campaign.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const queueCounts = await fetchQueueCounts(supabase, campaignId);
  let details: unknown = null;
  if (
    campaign.type &&
    campaign.type !== "email" &&
    ["live_call", "message", "robocall", "simple_ivr", "complex_ivr"].includes(
      campaign.type,
    )
  ) {
    const tableKey = getCampaignTableKey(
      campaign.type as Exclude<Campaign["type"], "email" | null>,
    );
    details = await fetchCampaignDetails(
      supabase,
      campaignId,
      workspaceId,
      tableKey,
    );
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
  const campaign = await fetchCampaignData(supabase, campaignId);
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
    workspace: workspaceId,
  };

  const { data: newCampaign, error } = await supabase
    .from("campaign")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !newCampaign) {
    logger.error("duplicateCampaignApi insert", error);
    return {
      ok: false as const,
      error: error?.message ?? "Failed to duplicate campaign",
      status: 500,
    };
  }

  if (
    campaign.type &&
    campaign.type !== "email" &&
    ["live_call", "message", "robocall", "simple_ivr", "complex_ivr"].includes(
      campaign.type,
    )
  ) {
    const tableKey = getCampaignTableKey(
      campaign.type as Exclude<Campaign["type"], "email" | null>,
    );
    const details = await fetchCampaignDetails(
      supabase,
      campaignId,
      workspaceId,
      tableKey,
    );

    if (details) {
      const { campaign_id: _detailCampaignId, ...detailRest } = details as Record<
        string,
        unknown
      >;
      await supabase.from(tableKey).insert({
        ...detailRest,
        campaign_id: newCampaign.id,
        workspace: workspaceId,
      });
    }
  }

  const { data: originalQueue } = await supabase
    .from("campaign_queue")
    .select("contact_id")
    .eq("campaign_id", Number(campaignId));

  if (originalQueue?.length) {
    await supabase.from("campaign_queue").insert(
      originalQueue.map((item) => ({
        campaign_id: newCampaign.id,
        contact_id: item.contact_id,
        workspace: workspaceId,
      })),
    );
  }

  if (audiences?.length) {
    await supabase.from("campaign_audience").insert(
      audiences.map((row: { audience_id: number }) => ({
        campaign_id: newCampaign.id,
        audience_id: row.audience_id,
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
  const { data: campaignRecord, error: campaignError } = await supabase
    .from("campaign")
    .select("*")
    .eq("id", Number(campaignId))
    .eq("workspace", workspaceId)
    .single();

  if (campaignError || !campaignRecord) {
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

    const detailTable = getCampaignTableKey(
      campaignRecord.type as Exclude<Campaign["type"], "email" | null>,
    );
    const { data: campaignDetails, error: detailError } = await supabase
      .from(detailTable)
      .select("*")
      .eq("campaign_id", Number(campaignId))
      .eq("workspace", workspaceId)
      .maybeSingle();

    if (detailError) {
      return { ok: false as const, error: detailError.message, status: 500 };
    }

    const queueCounts = await fetchQueueCounts(supabase, campaignId);
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

  const { error } = await supabase
    .from("campaign")
    .update(update)
    .eq("id", Number(campaignId))
    .eq("workspace", workspaceId);

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, status, is_active: update.is_active ?? null };
}

export async function getCampaignQueueApi(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  workspaceId: string,
  searchParams: URLSearchParams,
) {
  const campaign = await fetchCampaignData(supabase, campaignId);
  if (!campaign || campaign.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get("page_size") || "50", 10) || 50),
  );
  const offset = (page - 1) * pageSize;

  const filters = normalizeQueueFilters({
    name: searchParams.get("name") ?? undefined,
    phone: searchParams.get("phone") ?? undefined,
    email: searchParams.get("email") ?? undefined,
    address: searchParams.get("address") ?? undefined,
    audiences: searchParams.get("audiences") ?? undefined,
    disposition: searchParams.get("disposition") ?? undefined,
    queueStatus: searchParams.get("queue_status") ?? undefined,
  });

  const selectFields = [
    "*",
    `contact!left(
      *,
      outreach_attempt!left(id, disposition, campaign_id),
      contact_audience!left(...audience!left(name))
    )`,
  ];

  const [queueResult, unfilteredCount, queuedCount] = await Promise.all([
    filteredSearch("", filters, supabase, selectFields, campaignId)
      .range(offset, offset + pageSize - 1)
      .then(({ data, error, count }) => ({ data, error, count })),
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", Number(campaignId))
      .then(({ count, error }) => ({ count, error })),
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", Number(campaignId))
      .eq("status", QUEUE_STATUS_QUEUED)
      .then(({ count, error }) => ({ count, error })),
  ]);

  if (queueResult.error) {
    return { ok: false as const, error: queueResult.error.message, status: 500 };
  }

  return {
    ok: true as const,
    queue: {
      items: queueResult.data ?? [],
      pagination: {
        page,
        page_size: pageSize,
        total_count: queueResult.count ?? 0,
        unfiltered_count: unfilteredCount.count ?? 0,
        queued_count: queuedCount.count ?? 0,
      },
      filters,
    },
  };
}

export async function patchCampaignQueueApi(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  workspaceId: string,
  body: PatchCampaignQueueBody,
) {
  const campaign = await fetchCampaignData(supabase, campaignId);
  if (!campaign || campaign.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const filters = normalizeQueueFilters(body.filters);

  switch (body.action) {
    case "update_status": {
      if (body.all) {
        const { data: rows, error } = await filteredSearch(
          "",
          filters,
          supabase,
          ["id"],
          campaignId,
        );
        if (error) {
          return { ok: false as const, error: error.message, status: 500 };
        }
        const ids = (rows ?? [])
          .map((row) => (row as unknown as { id: number }).id)
          .filter((id) => Number.isFinite(id));
        if (ids.length > 0) {
          const { error: updateError } = await supabase
            .from("campaign_queue")
            .update({ status: body.status! })
            .in("id", ids);
          if (updateError) {
            return { ok: false as const, error: updateError.message, status: 500 };
          }
        }
      } else if (body.ids?.length) {
        const { error } = await supabase
          .from("campaign_queue")
          .update({ status: body.status! })
          .in("id", body.ids);
        if (error) {
          return { ok: false as const, error: error.message, status: 500 };
        }
      }
      return { ok: true as const, success: true };
    }
    case "add_contact_ids": {
      await enqueueContactsForCampaign(
        supabase,
        Number(campaignId),
        body.contact_ids!,
        { requeue: false },
      );
      return { ok: true as const, success: true };
    }
    case "add_audience": {
      const { data: contacts, error } = await supabase
        .from("contact_audience")
        .select("contact_id")
        .eq("audience_id", body.audience_id!);
      if (error) {
        return { ok: false as const, error: error.message, status: 500 };
      }
      await enqueueContactsForCampaign(
        supabase,
        Number(campaignId),
        contacts.map((row) => row.contact_id),
        { requeue: false },
      );
      return { ok: true as const, success: true };
    }
    case "remove": {
      if (body.all) {
        const { error } = await supabase
          .from("campaign_queue")
          .delete()
          .eq("campaign_id", Number(campaignId));
        if (error) {
          return { ok: false as const, error: error.message, status: 500 };
        }
      } else if (body.ids?.length) {
        const { error } = await supabase
          .from("campaign_queue")
          .delete()
          .in("id", body.ids);
        if (error) {
          return { ok: false as const, error: error.message, status: 500 };
        }
      }
      return { ok: true as const, success: true };
    }
    default: {
      const _exhaustive: never = body.action;
      return { ok: false as const, error: "Invalid action", status: 400 };
    }
  }
}

export async function listWorkspaceContactsApi(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  searchParams: URLSearchParams,
) {
  const rawSearchQuery = searchParams.get("q") ?? "";
  const searchQuery = rawSearchQuery.trim().replaceAll(",", " ");
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get("page_size") || "20", 10) || 20),
  );

  let countQuery = supabase
    .from("contact")
    .select("*", { count: "exact", head: true })
    .eq("workspace", workspaceId);

  let contactsQuery = supabase
    .from("contact")
    .select(
      "id, firstname, surname, phone, email, address, city, other_data, created_at",
    )
    .eq("workspace", workspaceId)
    .range((page - 1) * pageSize, page * pageSize - 1)
    .order("created_at", { ascending: false });

  if (searchQuery) {
    const searchFilter = buildContactSearchFilter(searchQuery);
    if (searchFilter) {
      countQuery = countQuery.or(searchFilter);
      contactsQuery = contactsQuery.or(searchFilter);
    }
  }

  const [{ count, error: countError }, { data: contacts, error: contactsError }] =
    await Promise.all([countQuery, contactsQuery]);

  if (countError || contactsError) {
    const message = countError?.message ?? contactsError?.message ?? "Failed to load contacts";
    return { ok: false as const, error: message, status: 500 };
  }

  const totalCount = count ?? 0;
  return {
    ok: true as const,
    contacts: contacts ?? [],
    pagination: {
      page,
      page_size: pageSize,
      total_count: totalCount,
      total_pages: Math.ceil(totalCount / pageSize),
    },
    search_query: searchQuery || null,
  };
}

export async function getContactDetailApi(
  supabase: SupabaseClient<Database>,
  contactId: string,
  workspaceId: string,
) {
  const { data: contact, error } = await supabase
    .from("contact")
    .select(`*, outreach_attempt(*, campaign(*)), contact_audience(*)`)
    .eq("id", Number(contactId))
    .eq("workspace", workspaceId)
    .single();

  if (error || !contact) {
    return { ok: false as const, error: "Contact not found", status: 404 };
  }

  return { ok: true as const, contact };
}

export async function deleteContactApi(
  supabase: SupabaseClient<Database>,
  contactId: string,
  workspaceId: string,
) {
  const { data: contact, error: lookupError } = await supabase
    .from("contact")
    .select("id")
    .eq("id", Number(contactId))
    .eq("workspace", workspaceId)
    .maybeSingle();

  if (lookupError) {
    return { ok: false as const, error: lookupError.message, status: 500 };
  }
  if (!contact) {
    return { ok: false as const, error: "Contact not found", status: 404 };
  }

  const { error } = await supabase
    .from("contact")
    .delete()
    .eq("id", Number(contactId))
    .eq("workspace", workspaceId);

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, success: true, contact_id: Number(contactId) };
}

export async function listWorkspaceAudiencesApi(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("audience")
    .select("*")
    .eq("workspace", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, audiences: data ?? [] };
}

export async function getAudienceDetailApi(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  audienceId: string,
  searchParams: URLSearchParams,
) {
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get("page_size") || "50", 10) || 50),
  );
  const sortKey = searchParams.get("sort_key") || "id";
  const sortDirection = searchParams.get("sort_direction") === "desc" ? "desc" : "asc";
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: audience, error: audienceError } = await supabase
    .from("audience")
    .select("*")
    .eq("id", Number(audienceId))
    .eq("workspace", workspaceId)
    .single();

  if (audienceError || !audience) {
    return { ok: false as const, error: "Audience not found", status: 404 };
  }

  let query = supabase
    .from("contact_audience")
    .select("...contact!inner(*)", { count: "exact" })
    .eq("audience_id", Number(audienceId));

  query = query.order(`contact(${sortKey})`, {
    ascending: sortDirection === "asc",
  });

  const { data: contacts, error: contactError, count } = await query.range(from, to);

  const { data: latestUpload } = await supabase
    .from("audience_upload")
    .select("*")
    .eq("audience_id", Number(audienceId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactError) {
    return { ok: false as const, error: contactError.message, status: 500 };
  }

  return {
    ok: true as const,
    audience,
    contacts: (contacts ?? []).map((row) => ({ contact: row })),
    pagination: {
      page,
      page_size: pageSize,
      total_count: count ?? 0,
    },
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
}

export async function listWorkspaceScriptsApi(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("script")
    .select("*")
    .eq("workspace", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, scripts: data ?? [] };
}

export async function getScriptDetailApi(
  supabase: SupabaseClient<Database>,
  scriptId: string,
  workspaceId: string,
) {
  const { data: script, error } = await supabase
    .from("script")
    .select("*")
    .eq("workspace", workspaceId)
    .eq("id", Number(scriptId))
    .single();

  if (error || !script) {
    return { ok: false as const, error: "Script not found", status: 404 };
  }

  return { ok: true as const, script };
}

export async function listWorkspaceSurveysApi(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("survey")
    .select(`*, survey_response(count)`)
    .eq("workspace", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, surveys: data ?? [] };
}

export async function getSurveyDetailApi(
  supabase: SupabaseClient<Database>,
  surveyId: string,
  workspaceId: string,
) {
  const { data: survey, error } = await supabase
    .from("survey")
    .select(`
      *,
      survey_page(
        *,
        survey_question(
          *,
          question_option(*)
        )
      ),
      survey_response(count)
    `)
    .eq("survey_id", surveyId)
    .eq("workspace", workspaceId)
    .single();

  if (error || !survey) {
    return { ok: false as const, error: "Survey not found", status: 404 };
  }

  return { ok: true as const, survey };
}

export async function getSurveyResponsesApi(
  supabase: SupabaseClient<Database>,
  surveyId: string,
  workspaceId: string,
) {
  const { data: survey, error: surveyError } = await supabase
    .from("survey")
    .select("id, survey_id, title, workspace")
    .eq("survey_id", surveyId)
    .eq("workspace", workspaceId)
    .single();

  if (surveyError || !survey) {
    return { ok: false as const, error: "Survey not found", status: 404 };
  }

  const { data: responses, error: responsesError } = await supabase
    .from("survey_response")
    .select(`
      *,
      contact(firstname, surname, phone, email),
      response_answer(
        *,
        survey_question(
          question_id,
          question_text,
          question_type,
          question_option(option_label)
        )
      )
    `)
    .eq("survey_id", survey.id)
    .order("created_at", { ascending: false });

  if (responsesError) {
    return { ok: false as const, error: responsesError.message, status: 500 };
  }

  const total = responses?.length ?? 0;
  const completed = responses?.filter((row) => row.completed_at)?.length ?? 0;

  return {
    ok: true as const,
    survey_id: survey.survey_id,
    responses: responses ?? [],
    stats: {
      total,
      completed,
      in_progress: total - completed,
      completion_rate: total > 0 ? (completed / total) * 100 : 0,
    },
  };
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function formatDateUtc(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toISOString();
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

  const { data: survey } = await supabase
    .from("survey")
    .select(`
      title,
      survey_page(
        page_order,
        survey_question(
          id,
          question_id,
          question_text,
          question_type,
          question_order
        )
      )
    `)
    .eq("survey_id", surveyId)
    .eq("workspace", workspaceId)
    .single();

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
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(10, Number.parseInt(searchParams.get("page_size") || "20", 10) || 20),
  );
  const offset = (page - 1) * pageSize;

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
    pagination: { page, page_size: pageSize, has_more: hasMore },
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

  const { data: uploadData, error: uploadError } = await supabase
    .from("audience_upload")
    .select("*")
    .eq("id", parsedUploadId)
    .single();

  if (uploadError || !uploadData) {
    return { ok: false as const, error: "Upload not found", status: 404 };
  }

  const { data: audience } = await supabase
    .from("audience")
    .select("workspace")
    .eq("id", uploadData.audience_id)
    .maybeSingle();

  if (!audience || audience.workspace !== workspaceId) {
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
