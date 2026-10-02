/**
 * Survey response reads and CSV export.
 *
 * Split out of `survey-db.server.ts` on 2026-10-02 (#2126). That file was pinned
 * at 928 lines by `scripts/check-app-file-size.mjs` — pinned rather than
 * exempted, so the next addition fails there rather than the cap being raised
 * again. This is the read-and-export half of the survey data layer: nothing here
 * writes a response or resolves a question, and nothing in the write half reads
 * responses back, so the seam is a real one rather than a line count.
 *
 * The body is the moved code **verbatim** — no refactor rode along with the move.
 * `buildSurveyResponsesCsv` reads the survey through `loadSurveyDetailByPublicId`,
 * which stays in `survey-db.server.ts`, so the dependency is one-directional and
 * there is no cycle.
 *
 * The public surface is unchanged: `survey-db.server.ts` re-exports all three
 * functions, so every existing import site keeps working.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { formatDateUtc, safeFilenamePart, toCsvString } from "@/lib/csv";
import { logger } from "@/lib/logger.server";
import {
  contact as contactTable,
  question_option as questionOptionTable,
  response_answer as responseAnswerTable,
  survey as surveyTable,
  survey_page as surveyPageTable,
  survey_question as surveyQuestionTable,
  survey_response as surveyResponseTable,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
// Baselined unscoped client: this is the code moved verbatim out of
// `survey-db.server.ts`, which held the same baselined import
// (`app/lib/survey-db.server.ts::@/server/db`). The reads below are already
// workspace-scoped — `createTenantDb(workspaceId)` supplies the tenancy filter —
// and converting them is a separate change from relocating them.
import { db } from "@/server/db";
import { loadSurveyDetailByPublicId } from "@/lib/survey-db.server";
import { formatSurveyAnswer } from "@/lib/survey-format";

export async function loadActiveSurveysForWorkspace(workspaceId: string) {
  const tdb = createTenantDb(workspaceId);
  return tdb.survey.findMany({
    where: eq(surveyTable.is_active, true),
    columns: { survey_id: true, title: true },
  });
}

export async function getSurveyResponsesForWorkspace(
  surveyPublicId: string,
  workspaceId: string,
) {
  const tdb = createTenantDb(workspaceId);

  try {
    const survey = await tdb.survey.findFirst({
      where: eq(surveyTable.survey_id, surveyPublicId),
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

    const answersByResponseId = new Map<
      number,
      Array<
        (typeof answerRows)[number] & {
          survey_question: {
            question_id: string;
            question_text: string;
            question_type: string;
            question_option: Array<{ option_label: string }>;
          } | null;
        }
      >
    >();

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
    logger.error("getSurveyResponsesForWorkspace error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load survey responses",
      status: 500,
    };
  }
}

export async function buildSurveyResponsesCsv(args: {
  workspaceId: string;
  surveyId: string;
}) {
  const result = await getSurveyResponsesForWorkspace(args.surveyId, args.workspaceId);
  if (!result.ok) {
    return result;
  }

  const survey = await loadSurveyDetailByPublicId(args.surveyId, {
    workspaceId: args.workspaceId,
  });
  if (!survey) {
    return { ok: false as const, error: "Survey not found", status: 404 };
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
    return answer ? formatSurveyAnswer(answer) : "-";
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

  return { ok: true as const, filename, csv };
}
