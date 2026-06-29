import { formatDateUtc, safeFilenamePart, toCsvString } from "@/lib/csv";
import {
  fetchBasicResults,
  fetchQueueCounts,
  getUserRole,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import {
  generateCampaignExportId,
  processCallCampaignExport,
  processMessageCampaignExport,
} from "@/lib/campaign-export.server";
import { loadWorkspaceAnalytics } from "@/lib/workspace-analytics.server";
import type { Database } from "@/lib/database.types";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResponseAnswer, Contact } from "@/lib/types";
import type { Tables } from "@/lib/database.types";

type SurveyPageWithQuestions = {
  page_order?: number;
  survey_question?: Array<{
    id: number;
    question_id: string;
    question_text: string;
    question_type: string;
    question_order?: number;
  }>;
};

type ResponseAnswerWithQuestion = ResponseAnswer & {
  survey_question?: {
    question_id: string;
    question_text: string;
    question_type: string;
    question_option?: Array<{ option_label: string }>;
  };
};

type SurveyResponseWithContact = Tables<"survey_response"> & {
  contact?: Pick<Contact, "firstname" | "surname" | "phone" | "email"> | null;
  response_answer?: ResponseAnswerWithQuestion[];
};

export type SerializedExportItem = {
  id: string;
  created_at: string;
  download_url?: string;
  campaign_id: string;
  campaign_name: string;
  expires_at: string;
  is_expired: boolean;
  status: string;
  progress: number;
  stage?: string;
  processed?: number;
  total?: number;
};

export async function getWorkspaceAnalyticsApi(
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

  const role = await getUserRole({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const canViewAllUsers =
    role?.role === MemberRole.Admin ||
    role?.role === MemberRole.Owner ||
    role?.role === MemberRole.Member;

  const analytics = await loadWorkspaceAnalytics({
    supabaseClient,
    workspaceId,
    requestUrl,
    currentUserId: userId,
    canViewAllUsers,
  });

  return { ok: true as const, analytics };
}

export async function getCampaignResultsApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  campaignId: string,
) {
  const { data: campaign, error } = await supabaseClient
    .from("campaign")
    .select("id, workspace, title, type")
    .eq("id", Number(campaignId))
    .single();

  if (error || !campaign || !campaign.workspace) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const workspaceId = campaign.workspace;
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const [results, queueCounts] = await Promise.all([
    fetchBasicResults({ workspaceId, campaignId, supabaseClient }),
    fetchQueueCounts({ workspaceId, campaignId, supabaseClient }),
  ]);

  return {
    ok: true as const,
    campaign: {
      id: campaign.id,
      title: campaign.title,
      type: campaign.type,
      workspace_id: campaign.workspace,
    },
    results: results ?? [],
    queue_counts: queueCounts,
  };
}

export async function listWorkspaceExportsApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const { data: files, error: listError } = await supabaseClient.storage
    .from("campaign-exports")
    .list(workspaceId, {
      sortBy: { column: "created_at", order: "desc" },
    });

  if (listError) {
    logger.error("listWorkspaceExportsApi error", listError);
    return { ok: false as const, error: listError.message, status: 500 };
  }

  const now = Date.now();
  const statusFiles = (files ?? []).filter((file) => file.name.endsWith(".json"));

  const processedExports = await Promise.all(
    statusFiles.map(async (file) => {
      try {
        const { data: statusData, error: downloadError } = await supabaseClient.storage
          .from("campaign-exports")
          .download(`${workspaceId}/${file.name}`);

        if (downloadError) {
          logger.error(`Error downloading export status ${file.name}`, downloadError);
          return null;
        }

        const content = JSON.parse(await statusData.text());
        const createdAt = new Date(content.created_at || file.created_at || Date.now());
        const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

        return {
          id: file.name.replace(".json", ""),
          created_at: createdAt.toISOString(),
          download_url: content.downloadUrl as string | undefined,
          campaign_id: String(content.campaignId ?? ""),
          campaign_name: (content.campaignName as string | undefined) ?? "Unnamed Campaign",
          expires_at: expiresAt.toISOString(),
          is_expired: now > expiresAt.getTime(),
          status: (content.status as string | undefined) ?? "unknown",
          progress: (content.progress as number | undefined) ?? 0,
          stage: content.stage as string | undefined,
          processed: content.processed as number | undefined,
          total: content.total as number | undefined,
        } satisfies SerializedExportItem;
      } catch (error) {
        logger.error(`Error processing export file ${file.name}`, error);
        return null;
      }
    }),
  );

  const exports = processedExports
    .filter((entry): entry is NonNullable<(typeof processedExports)[number]> => entry !== null)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );

  return { ok: true as const, exports };
}

export async function startCampaignExportApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  campaignId: number,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const { data: campaignRow, error: campaignRowError } = await supabaseClient
    .from("campaign")
    .select("id, type, title, workspace")
    .eq("id", campaignId)
    .single();

  if (campaignRowError || !campaignRow) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  if (campaignRow.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign does not belong to workspace", status: 403 };
  }

  const exportId = generateCampaignExportId();

  if (campaignRow.type === "message") {
    void processMessageCampaignExport(
      supabaseClient,
      campaignId,
      workspaceId,
      exportId,
      campaignRow.title || "",
    );
  } else if (campaignRow.type === "live_call" || campaignRow.type === "robocall") {
    void processCallCampaignExport(
      supabaseClient,
      campaignId,
      workspaceId,
      exportId,
      campaignRow.title || "",
    );
  } else {
    return { ok: false as const, error: "Invalid campaign type for export", status: 400 };
  }

  return {
    ok: true as const,
    export_id: exportId,
    status: "started" as const,
    status_url: `/api/campaign-export-status?exportId=${exportId}&workspaceId=${workspaceId}`,
  };
}

export async function buildSurveyResponsesCsv(args: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  surveyId: string;
}) {
  const { data: survey, error: surveyError } = await args.supabaseClient
    .from("survey")
    .select(
      `
      *,
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
    `,
    )
    .eq("survey_id", args.surveyId)
    .eq("workspace", args.workspaceId)
    .single();

  if (surveyError || !survey) {
    return { ok: false as const, error: "Survey not found", status: 404 };
  }

  const { data: responses, error: responsesError } = await args.supabaseClient
    .from("survey_response")
    .select(
      `
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
    `,
    )
    .eq("survey_id", survey.id)
    .order("created_at", { ascending: false });

  if (responsesError) {
    return { ok: false as const, error: "Error fetching responses", status: 500 };
  }

  const pages =
    (survey as Tables<"survey"> & { survey_page?: SurveyPageWithQuestions[] }).survey_page ??
    [];
  const allQuestions = pages
    .slice()
    .sort((a, b) => (a.page_order ?? 0) - (b.page_order ?? 0))
    .flatMap((page) =>
      (page.survey_question ?? [])
        .slice()
        .sort((a, b) => (a.question_order ?? 0) - (b.question_order ?? 0)),
    );

  const formatAnswer = (answer: ResponseAnswerWithQuestion) => {
    if (!answer) return "-";

    if (answer.survey_question?.question_type === "checkbox") {
      try {
        const values = JSON.parse(answer.answer_value);
        return Array.isArray(values) ? values.join(", ") : answer.answer_value;
      } catch {
        return answer.answer_value;
      }
    }
    return answer.answer_value;
  };

  const getContactName = (response: SurveyResponseWithContact) => {
    if (response.contact?.firstname && response.contact?.surname) {
      return `${response.contact.firstname} ${response.contact.surname}`;
    }
    if (response.contact?.phone) {
      return response.contact.phone;
    }
    if (response.contact?.email) {
      return response.contact.email;
    }
    return "Anonymous";
  };

  const getAnswerForQuestion = (
    response: SurveyResponseWithContact,
    questionId: string,
  ) => {
    const question = allQuestions.find((q) => q.question_id === questionId);
    if (!question) return "-";

    const answer = response.response_answer?.find(
      (a) => a.question_id === question.id,
    );
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

  const rows = ((responses || []) as SurveyResponseWithContact[]).map((response) => [
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

  return { ok: true as const, filename, csv };
}

export async function exportSurveyResponsesApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  surveyId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  return buildSurveyResponsesCsv({
    supabaseClient,
    workspaceId,
    surveyId,
  });
}
