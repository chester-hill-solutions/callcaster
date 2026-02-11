import type { ActionFunctionArgs } from "@remix-run/node";
import { verifyApiKeyOrSession } from "@/lib/api-auth.server";
import { createCampaign, requireWorkspaceAccess } from "@/lib/database.server";
import type { CampaignData, CampaignType } from "@/lib/database/campaign.server";
import { safeParseJson } from "@/lib/database.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { logger } from "@/lib/logger.server";
import type { Json } from "@/lib/database.types";

const SCRIPT_TYPES_FOR_CAMPAIGN: Record<CampaignType, string> = {
  live_call: "script",
  message: "script",
  robocall: "ivr",
  simple_ivr: "ivr",
  complex_ivr: "ivr",
};

const SCRIPT_CAMPAIGN_TYPES: CampaignType[] = [
  "live_call",
  "robocall",
  "simple_ivr",
  "complex_ivr",
];

interface CreateWithScriptBody {
  workspace_id?: string;
  title: string;
  type: CampaignType;
  caller_id: string;
  script?: {
    name: string;
    type?: string;
    steps: Record<string, unknown>;
  };
  script_id?: number;
  audience_ids?: number[];
  status?: string;
  enqueue_audience_contacts?: boolean;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  schedule?: unknown;
}

function jsonResponse(
  data: unknown,
  status: number,
  init?: { headers?: Record<string, string> }
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authResult = await verifyApiKeyOrSession(request);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status);
  }

  let body: CreateWithScriptBody;
  try {
    body = await safeParseJson<CreateWithScriptBody>(request);
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const {
    workspace_id: bodyWorkspaceId,
    title,
    type,
    caller_id,
    script: scriptPayload,
    script_id: existingScriptId,
    audience_ids = [],
    status = "draft",
    enqueue_audience_contacts = true,
    is_active,
    start_date,
    end_date,
    schedule,
  } = body;

  let workspaceId: string;
  const supabase =
    authResult.authType === "api_key"
      ? authResult.supabase
      : authResult.supabaseClient;

  if (authResult.authType === "api_key") {
    workspaceId = authResult.workspaceId;
    if (bodyWorkspaceId && bodyWorkspaceId !== workspaceId) {
      return jsonResponse(
        { error: "workspace_id does not match API key" },
        403
      );
    }
  } else {
    if (!bodyWorkspaceId) {
      return jsonResponse(
        { error: "workspace_id is required when using session auth" },
        400
      );
    }
    await requireWorkspaceAccess({
      supabaseClient: authResult.supabaseClient,
      user: authResult.user,
      workspaceId: bodyWorkspaceId,
    });
    workspaceId = bodyWorkspaceId;
  }

  if (!title || typeof title !== "string") {
    return jsonResponse({ error: "title is required" }, 400);
  }
  if (!type || !SCRIPT_CAMPAIGN_TYPES.includes(type)) {
    return jsonResponse(
      {
        error: `type must be one of: ${SCRIPT_CAMPAIGN_TYPES.join(", ")}`,
      },
      400
    );
  }
  if (!caller_id || typeof caller_id !== "string") {
    return jsonResponse({ error: "caller_id is required" }, 400);
  }

  if (!scriptPayload && existingScriptId == null) {
    return jsonResponse(
      { error: "Either script or script_id is required" },
      400
    );
  }

  // Validate caller_id belongs to workspace
  const { data: workspaceNumbers, error: numbersError } = await supabase
    .from("workspace_number")
    .select("phone_number")
    .eq("workspace", workspaceId);

  if (numbersError) {
    logger.error("Error fetching workspace numbers", numbersError);
    return jsonResponse(
      { error: "Failed to validate caller_id" },
      500
    );
  }

  const validNumbers = (workspaceNumbers ?? []).map((n) => n.phone_number);
  if (!validNumbers.includes(caller_id)) {
    return jsonResponse(
      {
        error:
          "caller_id must be a phone number that belongs to this workspace",
      },
      400
    );
  }

  // Validate audience_ids belong to workspace
  if (audience_ids.length > 0) {
    const { data: workspaceAudiences, error: audError } = await supabase
      .from("audience")
      .select("id")
      .eq("workspace", workspaceId);

    if (audError) {
      logger.error("Error fetching workspace audiences", audError);
      return jsonResponse(
        { error: "Failed to validate audience_ids" },
        500
      );
    }

    const validAudienceIds = new Set(
      (workspaceAudiences ?? []).map((a) => a.id)
    );
    const invalid = audience_ids.filter((id) => !validAudienceIds.has(id));
    if (invalid.length > 0) {
      return jsonResponse(
        {
          error: `audience_ids must belong to this workspace; invalid: ${invalid.join(", ")}`,
        },
        400
      );
    }
  }

  let scriptId: number | null = null;
  let createdScript: { id: number; name: string; type: string | null; steps: unknown } | null = null;

  if (scriptPayload) {
    const scriptType =
      scriptPayload.type ??
      SCRIPT_TYPES_FOR_CAMPAIGN[type as keyof typeof SCRIPT_TYPES_FOR_CAMPAIGN];
    const steps = scriptPayload.steps ?? { pages: {}, blocks: {} };
    const createdBy =
      authResult.authType === "session" ? authResult.user?.id : null;

    const { data: scriptRows, error: scriptError } = await supabase
      .from("script")
      .insert({
        name: scriptPayload.name ?? "Campaign script",
        type: scriptType,
        steps: steps as Json,
        workspace: workspaceId,
        created_by: createdBy,
      })
      .select("id, name, type, steps");

    if (scriptError) {
      logger.error("Error creating script", scriptError);
      return jsonResponse(
        { error: `Failed to create script: ${scriptError.message}` },
        500
      );
    }

    const scriptRow = Array.isArray(scriptRows) ? scriptRows[0] : scriptRows;
    if (!scriptRow) {
      return jsonResponse({ error: "Failed to create script" }, 500);
    }
    scriptId = scriptRow.id;
    createdScript = {
      id: scriptRow.id,
      name: scriptRow.name,
      type: scriptRow.type,
      steps: scriptRow.steps,
    };
  } else if (existingScriptId != null) {
    scriptId = existingScriptId;
  }

  const campaignData: CampaignData = {
    workspace: workspaceId,
    title,
    type,
    caller_id,
    script_id: scriptId ?? undefined,
    status,
    is_active: Boolean(is_active),
    start_date: start_date ?? undefined,
    end_date: end_date ?? undefined,
    schedule: schedule ?? undefined,
  };

  let campaign: { id: number; [key: string]: unknown };
  let campaignDetails: { campaign_id: number; [key: string]: unknown };

  try {
    const result = await createCampaign({
      supabase,
      campaignData,
    });
    campaign = result.campaign as { id: number; [key: string]: unknown };
    campaignDetails = result.campaignDetails as {
      campaign_id: number;
      [key: string]: unknown;
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Error creating campaign", err);
    return jsonResponse(
      { error: `Failed to create campaign: ${message}` },
      400
    );
  }

  const campaignId = campaign.id;
  let audiencesLinked = 0;
  let contactsEnqueued = 0;

  // Track queued contact_ids across audiences (fetch once, then update as we enqueue)
  let queuedContactIds = new Set<number>();
  if (enqueue_audience_contacts && audience_ids.length > 0) {
    const { data: queuedRows } = await supabase
      .from("campaign_queue")
      .select("contact_id")
      .eq("campaign_id", campaignId);
    queuedContactIds = new Set((queuedRows ?? []).map((r) => r.contact_id));
  }

  for (const audienceId of audience_ids) {
    const { data: existing, error: checkError } = await supabase
      .from("campaign_audience")
      .select()
      .eq("campaign_id", campaignId)
      .eq("audience_id", audienceId)
      .maybeSingle();

    if (checkError) {
      logger.error("Error checking campaign_audience", checkError);
      continue;
    }
    if (existing) continue;

    const { error: addError } = await supabase
      .from("campaign_audience")
      .insert({ campaign_id: campaignId, audience_id: audienceId });

    if (addError) {
      logger.error("Error adding campaign_audience", addError);
      continue;
    }
    audiencesLinked += 1;

    if (enqueue_audience_contacts) {
      const { data: audienceContacts, error: contactsError } = await supabase
        .from("contact_audience")
        .select("contact_id")
        .eq("audience_id", audienceId);

      if (contactsError) {
        logger.error("Error fetching audience contacts", contactsError);
        continue;
      }

      const audienceContactIds = (audienceContacts ?? []).map((c) => c.contact_id);
      const contactIdsToEnqueue = audienceContactIds.filter(
        (id) => !queuedContactIds.has(id)
      );

      if (contactIdsToEnqueue.length > 0) {
        await enqueueContactsForCampaign(supabase, campaignId, contactIdsToEnqueue, {
          requeue: false,
        });
        contactsEnqueued += contactIdsToEnqueue.length;
        contactIdsToEnqueue.forEach((id) => queuedContactIds.add(id));
      }
    }
  }

  return jsonResponse(
    {
      campaign,
      campaignDetails,
      ...(createdScript && { script: createdScript }),
      audiences_linked: audiencesLinked,
      contacts_enqueued: contactsEnqueued,
    },
    201
  );
};
