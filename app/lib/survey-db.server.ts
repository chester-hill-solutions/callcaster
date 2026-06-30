import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { formatDateUtc, safeFilenamePart, toCsvString } from "@/lib/csv";
import { logger } from "@/lib/logger.server";
import { isUniqueViolation } from "@/lib/parse-utils.server";
import type { SurveyFormData } from "@/lib/types";
import {
  contact as contactTable,
  question_option as questionOptionTable,
  response_answer as responseAnswerTable,
  survey as surveyTable,
  survey_page as surveyPageTable,
  survey_question as surveyQuestionTable,
  survey_response as surveyResponseTable,
  user as userTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";

type SurveyRow = typeof surveyTable.$inferSelect;
type SurveyResponseRow = typeof surveyResponseTable.$inferSelect;

export async function findUserById(userId: string) {
  const [row] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
  return row ?? null;
}

export async function getSurveyWorkspaceByPublicId(surveyPublicId: string) {
  const [row] = await db
    .select({ workspace: surveyTable.workspace })
    .from(surveyTable)
    .where(eq(surveyTable.survey_id, surveyPublicId))
    .limit(1);
  return row?.workspace ?? null;
}

export async function loadSurveyResponseCounts(surveyIds: number[]) {
  if (surveyIds.length === 0) {
    return new Map<number, number>();
  }

  const rows = await db
    .select({
      survey_id: surveyResponseTable.survey_id,
      value: count(),
    })
    .from(surveyResponseTable)
    .where(inArray(surveyResponseTable.survey_id, surveyIds))
    .groupBy(surveyResponseTable.survey_id);

  return new Map(rows.map((row) => [row.survey_id, row.value]));
}

export async function loadSurveyDetailByPublicId(
  surveyPublicId: string,
  loadOptions?: { workspaceId?: string; activeOnly?: boolean },
) {
  let survey: SurveyRow | null | undefined;

  if (loadOptions?.workspaceId) {
    const tdb = createTenantDb(loadOptions.workspaceId);
    survey = (await tdb.survey.findFirst({
      where: eq(surveyTable.survey_id, surveyPublicId),
    })) as SurveyRow | undefined;
  } else {
    const conditions = [eq(surveyTable.survey_id, surveyPublicId)];
    if (loadOptions?.activeOnly) {
      conditions.push(eq(surveyTable.is_active, true));
    }
    const [row] = await db
      .select()
      .from(surveyTable)
      .where(and(...conditions))
      .limit(1);
    survey = row ?? null;
  }

  if (!survey) {
    return null;
  }

  const pages = await db
    .select()
    .from(surveyPageTable)
    .where(eq(surveyPageTable.survey_id, survey.id))
    .orderBy(asc(surveyPageTable.page_order));

  const pageIds = pages.map((page) => page.id);
  const questions =
    pageIds.length === 0
      ? []
      : await db
          .select()
          .from(surveyQuestionTable)
          .where(inArray(surveyQuestionTable.page_id, pageIds))
          .orderBy(asc(surveyQuestionTable.question_order));

  const questionIds = questions.map((question) => question.id);
  const options =
    questionIds.length === 0
      ? []
      : await db
          .select()
          .from(questionOptionTable)
          .where(inArray(questionOptionTable.question_id, questionIds))
          .orderBy(asc(questionOptionTable.option_order));

  const optionsByQuestionId = new Map<number, typeof options>();
  for (const option of options) {
    const existing = optionsByQuestionId.get(option.question_id) ?? [];
    existing.push(option);
    optionsByQuestionId.set(option.question_id, existing);
  }

  const questionsByPageId = new Map<
    number,
    Array<
      (typeof questions)[number] & {
        question_option: typeof options;
      }
    >
  >();
  for (const question of questions) {
    const existing = questionsByPageId.get(question.page_id) ?? [];
    existing.push({
      ...question,
      question_option: optionsByQuestionId.get(question.id) ?? [],
    });
    questionsByPageId.set(question.page_id, existing);
  }

  const [responseCount] = await db
    .select({ value: count() })
    .from(surveyResponseTable)
    .where(eq(surveyResponseTable.survey_id, survey.id));

  return {
    ...survey,
    survey_page: pages.map((page) => ({
      ...page,
      survey_question: questionsByPageId.get(page.id) ?? [],
    })),
    survey_response: [{ count: responseCount?.value ?? 0 }],
  };
}

export async function loadContactById(contactId: number) {
  const [row] = await db
    .select()
    .from(contactTable)
    .where(eq(contactTable.id, contactId))
    .limit(1);
  return row ?? null;
}

export async function loadRecentSurveyResponses(surveyInternalId: number, limit = 10) {
  const responses = await db
    .select()
    .from(surveyResponseTable)
    .where(eq(surveyResponseTable.survey_id, surveyInternalId))
    .orderBy(desc(surveyResponseTable.created_at))
    .limit(limit);

  const contactIds = [
    ...new Set(
      responses
        .map((response) => response.contact_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];

  const contacts =
    contactIds.length === 0
      ? []
      : await db
          .select({
            id: contactTable.id,
            firstname: contactTable.firstname,
            surname: contactTable.surname,
            phone: contactTable.phone,
          })
          .from(contactTable)
          .where(inArray(contactTable.id, contactIds));

  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));

  return responses.map((response) => ({
    ...response,
    contact: response.contact_id ? contactById.get(response.contact_id) ?? null : null,
  }));
}

export async function loadExistingResponseWithAnswers(args: {
  surveyInternalId: number;
  contactId: number;
}) {
  const [response] = await db
    .select()
    .from(surveyResponseTable)
    .where(
      and(
        eq(surveyResponseTable.survey_id, args.surveyInternalId),
        eq(surveyResponseTable.contact_id, args.contactId),
      ),
    )
    .orderBy(desc(surveyResponseTable.created_at))
    .limit(1);

  if (!response) {
    return { response: null, answers: {} as Record<string, string | string[]> };
  }

  const answers = await db
    .select({
      answer_value: responseAnswerTable.answer_value,
      question_id: surveyQuestionTable.question_id,
    })
    .from(responseAnswerTable)
    .innerJoin(
      surveyQuestionTable,
      eq(responseAnswerTable.question_id, surveyQuestionTable.id),
    )
    .where(eq(responseAnswerTable.response_id, response.id));

  const answersByQuestionId = answers.reduce<Record<string, string | string[]>>(
    (acc, answer) => {
      acc[answer.question_id] = answer.answer_value;
      return acc;
    },
    {},
  );

  return { response, answers: answersByQuestionId };
}

export async function createSurveyWithStructure(args: {
  workspaceId: string;
  surveyData: SurveyFormData;
}) {
  const now = new Date().toISOString();
  const tdb = createTenantDb(args.workspaceId);
  const [survey] = await tdb.survey.insert({
    survey_id: args.surveyData.survey_id,
    title: args.surveyData.title,
    is_active: args.surveyData.is_active || false,
    created_at: now,
    updated_at: now,
  });

  if (args.surveyData.pages?.length) {
    for (const page of args.surveyData.pages) {
      const [surveyPage] = await db
        .insert(surveyPageTable)
        .values({
          survey_id: survey.id,
          page_id: page.page_id,
          title: page.title,
          page_order: page.page_order,
          created_at: now,
          updated_at: now,
        })
        .returning();

      if (!surveyPage) {
        continue;
      }

      if (page.questions?.length) {
        for (const question of page.questions) {
          const [surveyQuestion] = await db
            .insert(surveyQuestionTable)
            .values({
              page_id: surveyPage.id,
              question_id: question.question_id,
              question_text: question.question_text,
              question_type: question.question_type,
              is_required: question.is_required,
              question_order: question.question_order,
              created_at: now,
              updated_at: now,
            })
            .returning();

          if (!surveyQuestion) {
            continue;
          }

          if (question.options?.length) {
            for (const option of question.options) {
              await db.insert(questionOptionTable).values({
                question_id: surveyQuestion.id,
                option_value: option.option_value,
                option_label: option.option_label,
                option_order: option.option_order,
                created_at: now,
              });
            }
          }
        }
      }
    }
  }

  return survey;
}

export async function updateSurveyMetadata(args: {
  workspaceId: string;
  surveyPublicId: string;
  title: string;
  is_active: boolean;
}) {
  const tdb = createTenantDb(args.workspaceId);
  const rows = await tdb.survey.update({
    set: {
      title: args.title,
      is_active: args.is_active,
      updated_at: new Date().toISOString(),
    },
    where: eq(surveyTable.survey_id, args.surveyPublicId),
  });
  return rows[0] ?? null;
}

export async function deleteSurveyByPublicId(workspaceId: string, surveyPublicId: string) {
  const tdb = createTenantDb(workspaceId);
  await tdb.survey.delete({
    where: eq(surveyTable.survey_id, surveyPublicId),
  });
}

export async function getSurveyByInternalId(surveyInternalId: number) {
  const [row] = await db
    .select({ id: surveyTable.id, is_active: surveyTable.is_active })
    .from(surveyTable)
    .where(eq(surveyTable.id, surveyInternalId))
    .limit(1);
  return row ?? null;
}

export async function getActiveSurveyByPublicId(surveyPublicId: string) {
  const [row] = await db
    .select({ id: surveyTable.id, is_active: surveyTable.is_active })
    .from(surveyTable)
    .where(and(eq(surveyTable.survey_id, surveyPublicId), eq(surveyTable.is_active, true)))
    .limit(1);
  return row ?? null;
}

async function getOrCreateSurveyResponse(args: {
  surveyInternalId: number;
  resultId: string;
  contactId: number | null;
  startedAt: string;
  lastPageCompleted: string | null;
  completedAt?: string | null;
}): Promise<{ row: SurveyResponseRow; created: boolean } | { error: unknown }> {
  try {
    const [inserted] = await db
      .insert(surveyResponseTable)
      .values({
        survey_id: args.surveyInternalId,
        result_id: args.resultId,
        contact_id: args.contactId,
        started_at: args.startedAt,
        completed_at: args.completedAt ?? null,
        last_page_completed: args.lastPageCompleted,
        created_at: args.startedAt,
        updated_at: args.startedAt,
      })
      .returning();

    if (inserted) {
      return { row: inserted, created: true };
    }
  } catch (error) {
    if (!isUniqueViolation(error)) {
      return { error };
    }
  }

  const [existing] = await db
    .select()
    .from(surveyResponseTable)
    .where(eq(surveyResponseTable.result_id, args.resultId))
    .limit(1);

  if (!existing) {
    return { error: new Error("Failed to load survey response") };
  }

  return { row: existing, created: false };
}

async function upsertResponseAnswer(args: {
  responseId: number;
  questionInternalId: number;
  answerValue: string;
  answeredAt: string;
}) {
  try {
    await db.insert(responseAnswerTable).values({
      response_id: args.responseId,
      question_id: args.questionInternalId,
      answer_value: args.answerValue,
      answered_at: args.answeredAt,
      created_at: args.answeredAt,
    });
    return { ok: true as const };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      return { ok: false as const, error };
    }
  }

  try {
    await db
      .update(responseAnswerTable)
      .set({
        answer_value: args.answerValue,
        answered_at: args.answeredAt,
      })
      .where(
        and(
          eq(responseAnswerTable.response_id, args.responseId),
          eq(responseAnswerTable.question_id, args.questionInternalId),
        ),
      );
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error };
  }
}

export async function saveSurveyAnswer(args: {
  surveyInternalId: number;
  questionPublicId: string;
  answerValue: string;
  contactId: number | null;
  resultId: string;
  pageId: string;
}) {
  const survey = await getSurveyByInternalId(args.surveyInternalId);
  if (!survey) {
    return { ok: false as const, error: "Survey not found", status: 404 };
  }
  if (!survey.is_active) {
    return { ok: false as const, error: "Survey is not active", status: 400 };
  }

  const nowIso = new Date().toISOString();
  const created = await getOrCreateSurveyResponse({
    surveyInternalId: args.surveyInternalId,
    resultId: args.resultId,
    contactId: args.contactId,
    startedAt: nowIso,
    lastPageCompleted: args.pageId,
  });

  if ("error" in created) {
    logger.error("Error creating survey response:", created.error);
    return { ok: false as const, error: "Failed to create survey response", status: 500 };
  }

  try {
    await db
      .update(surveyResponseTable)
      .set({
        last_page_completed: args.pageId,
        updated_at: nowIso,
      })
      .where(eq(surveyResponseTable.id, created.row.id));
  } catch (error) {
    logger.error("Error updating survey response:", error);
  }

  const [question] = await db
    .select({ id: surveyQuestionTable.id })
    .from(surveyQuestionTable)
    .where(eq(surveyQuestionTable.question_id, args.questionPublicId))
    .limit(1);

  if (!question) {
    return { ok: false as const, error: "Question not found", status: 404 };
  }

  const upsert = await upsertResponseAnswer({
    responseId: created.row.id,
    questionInternalId: question.id,
    answerValue: args.answerValue,
    answeredAt: nowIso,
  });

  if (!upsert.ok) {
    logger.error("Error saving answer:", upsert.error);
    return { ok: false as const, error: "Failed to save answer", status: 500 };
  }

  return {
    ok: true as const,
    response_id: created.row.id,
    result_id: args.resultId,
  };
}

type SubmittedSurveyAnswer = {
  question_id: string;
  answer_value: string | string[];
};

export async function submitSurveyResponse(args: {
  surveyPublicId: string;
  responseData: {
    result_id: string;
    contact_id?: number | null;
    completed?: boolean;
    last_page_completed?: string | null;
    answers?: SubmittedSurveyAnswer[];
  };
}) {
  const survey = await loadSurveyDetailByPublicId(args.surveyPublicId);
  if (!survey) {
    return { ok: false as const, error: "Survey not found", status: 404 };
  }
  if (!survey.is_active) {
    return { ok: false as const, error: "Survey is not active", status: 400 };
  }

  const nowIso = new Date().toISOString();
  const created = await getOrCreateSurveyResponse({
    surveyInternalId: survey.id,
    resultId: args.responseData.result_id,
    contactId: args.responseData.contact_id ?? null,
    startedAt: nowIso,
    lastPageCompleted: args.responseData.last_page_completed ?? null,
    completedAt: args.responseData.completed ? nowIso : null,
  });

  if ("error" in created) {
    logger.error("Error creating survey response:", created.error);
    return { ok: false as const, error: "Failed to submit response", status: 500 };
  }

  if (!created.created) {
    await db
      .update(surveyResponseTable)
      .set({
        completed_at: args.responseData.completed ? nowIso : null,
        last_page_completed: args.responseData.last_page_completed ?? null,
        updated_at: nowIso,
      })
      .where(eq(surveyResponseTable.id, created.row.id));
  }

  if (args.responseData.answers?.length) {
    let pageInternalId: number | null = null;
    if (args.responseData.last_page_completed) {
      const [page] = await db
        .select({ id: surveyPageTable.id })
        .from(surveyPageTable)
        .where(
          and(
            eq(surveyPageTable.survey_id, survey.id),
            eq(surveyPageTable.page_id, args.responseData.last_page_completed),
          ),
        )
        .limit(1);
      pageInternalId = page?.id ?? null;
    }

    for (const answer of args.responseData.answers) {
      const conditions = [eq(surveyQuestionTable.question_id, answer.question_id)];
      if (pageInternalId != null) {
        conditions.push(eq(surveyQuestionTable.page_id, pageInternalId));
      }

      const [question] = await db
        .select({ id: surveyQuestionTable.id })
        .from(surveyQuestionTable)
        .where(and(...conditions))
        .limit(1);

      if (!question) {
        logger.error("Question not found:", answer.question_id);
        continue;
      }

      const answerValue = Array.isArray(answer.answer_value)
        ? JSON.stringify(answer.answer_value)
        : answer.answer_value;

      const upsert = await upsertResponseAnswer({
        responseId: created.row.id,
        questionInternalId: question.id,
        answerValue,
        answeredAt: nowIso,
      });

      if (!upsert.ok) {
        logger.error("Failed to upsert response_answer:", upsert.error);
      }
    }
  }

  return {
    ok: true as const,
    response_id: created.row.id,
    result_id: args.responseData.result_id,
  };
}

export async function completeSurveyResponse(args: {
  surveyPublicId: string;
  resultId: string;
  completed: boolean;
}) {
  const survey = await getActiveSurveyByPublicId(args.surveyPublicId);
  if (!survey) {
    return { ok: false as const, error: "Survey not found", status: 404 };
  }

  const nowIso = new Date().toISOString();
  try {
    await db
      .update(surveyResponseTable)
      .set({
        completed_at: args.completed ? nowIso : null,
        updated_at: nowIso,
      })
      .where(eq(surveyResponseTable.result_id, args.resultId));
  } catch (error) {
    logger.error("Error completing survey:", error);
    return { ok: false as const, error: "Failed to complete survey", status: 500 };
  }

  return { ok: true as const, result_id: args.resultId };
}

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

  return { ok: true as const, filename, csv };
}
