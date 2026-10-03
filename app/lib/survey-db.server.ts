import { and, asc, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { formatDateUtc, safeFilenamePart, toCsvString } from "@/lib/csv";
import { logger } from "@/lib/logger.server";
import { isInvalidTextRepresentation, isUniqueViolation } from "@/lib/parse-utils.server";
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
import { db, type Database } from "@/server/db";
import { formatSurveyAnswer } from "@/lib/survey-format";

export { formatSurveyAnswer };
import { createTenantDb } from "@/server/tenant-db";

/**
 * Response reads and CSV export moved to `./survey-responses.server` (#2126), when
 * this file hit its 928-line pin. Re-exported rather than left behind so no
 * import site had to change.
 */
export {
  buildSurveyResponsesCsv,
  getSurveyResponsesForWorkspace,
  loadActiveSurveysForWorkspace,
  loadExistingResponseWithAnswers,
} from "./survey-responses.server";


type SurveyRow = typeof surveyTable.$inferSelect;
type SurveyResponseRow = typeof surveyResponseTable.$inferSelect;

/**
 * Resolve a page's internal id from its public label, scoped to one survey.
 *
 * `survey_page.page_id` is a short per-survey label — `page-1` recurs in every
 * survey — so the label alone does not identify a page, and neither does it
 * identify a question: `survey_question.question_id` is likewise a per-page
 * label, so `question-1` exists on every page of every survey. An unscoped
 * `where page_id = ?` therefore returns an arbitrary row from the whole table.
 *
 * Both public entry points that resolve a question go through here, because the
 * two lookups differ only in where they read the label from. Returning `null`
 * rather than throwing lets each caller choose its own status: `saveSurveyAnswer`
 * answers 404, `submitSurveyResponse` treats it as "no page scope" and still
 * scopes by survey through the join.
 */
async function resolveSurveyPageInternalId(
  surveyInternalId: number,
  pageLabel: string,
): Promise<number | null> {
  const [page] = await db
    .select({ id: surveyPageTable.id })
    .from(surveyPageTable)
    .where(
      and(
        eq(surveyPageTable.survey_id, surveyInternalId),
        eq(surveyPageTable.page_id, pageLabel),
      ),
    )
    .limit(1);

  return page?.id ?? null;
}

/**
 * Resolve a question's internal id from its public label, scoped to one page.
 *
 * Scoping by page is only sufficient because the page was itself resolved
 * through its survey — see {@link resolveSurveyPageInternalId}.
 */
async function resolveSurveyQuestionInternalId(
  pageInternalId: number,
  questionLabel: string,
): Promise<number | null> {
  const [question] = await db
    .select({ id: surveyQuestionTable.id })
    .from(surveyQuestionTable)
    .where(
      and(
        eq(surveyQuestionTable.page_id, pageInternalId),
        eq(surveyQuestionTable.question_id, questionLabel),
      ),
    )
    .limit(1);

  return question?.id ?? null;
}

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

  try {
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
  } catch (error) {
    if (isInvalidTextRepresentation(error)) {
      return null;
    }
    throw error;
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

  if (!survey) {
    throw new Error("Failed to insert survey");
  }

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

/**
 * Update a survey's title/active flag and, when `pages` is supplied, sync the
 * full page/question/option structure to match it. Pages/questions/options
 * are matched by their public `page_id`/`question_id`/`option_value` (unique
 * per parent in the live schema) and upserted; anything no longer present in
 * `pages` is deleted (cascading to its own children and any historical
 * `response_answer` rows — removing a question is expected to remove answers
 * to it). Runs in a transaction so a partial structure never lands.
 *
 * `pages` is optional so existing metadata-only callers keep working; the
 * survey edit flow must pass `surveyData.pages` or edits to questions/pages
 * remain a silent no-op (this was the root cause of the P1 "editing a survey
 * discards question/page edits" bug).
 */
// updateSurveyMetadata moved to survey-structure.server.ts (size ratchet).
export { updateSurveyMetadata } from "@/lib/survey-structure.server";


export async function deleteSurveyByPublicId(workspaceId: string, surveyPublicId: string) {
  const tdb = createTenantDb(workspaceId);
  await tdb.survey.delete({
    where: eq(surveyTable.survey_id, surveyPublicId),
  });
}

export async function getSurveyByInternalId(surveyInternalId: number) {
  const [row] = await db
    .select({ id: surveyTable.id, is_active: surveyTable.is_active, workspace: surveyTable.workspace })
    .from(surveyTable)
    .where(eq(surveyTable.id, surveyInternalId))
    .limit(1);
  return row ?? null;
}

export async function getActiveSurveyByPublicId(surveyPublicId: string) {
  const [row] = await db
    .select({ id: surveyTable.id, is_active: surveyTable.is_active, workspace: surveyTable.workspace })
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
        contact_id: args.contactId ?? undefined,
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
    .where(
      and(
        eq(surveyResponseTable.survey_id, args.surveyInternalId),
        eq(surveyResponseTable.result_id, args.resultId),
      ),
    )
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

  // Scope the question by page, scoped in turn by survey. `question_id` is a
  // short per-page label — `question-1` recurs on every page of every survey —
  // so `where question_id = ? limit 1` with no other predicate returns an
  // *arbitrary* row from the whole table. An anonymous caller could name another
  // tenant's `question-1` and have the answer stored against it, where it renders
  // in that survey's results and export (#2126).
  const pageInternalId = await resolveSurveyPageInternalId(survey.id, args.pageId);
  if (pageInternalId === null) {
    return { ok: false as const, error: "Page not found", status: 404 };
  }

  const questionInternalId = await resolveSurveyQuestionInternalId(
    pageInternalId,
    args.questionPublicId,
  );
  if (questionInternalId === null) {
    return { ok: false as const, error: "Question not found", status: 404 };
  }

  const upsert = await upsertResponseAnswer({
    responseId: created.row.id,
    questionInternalId,
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
    // `null` when no page label was submitted, which is the case the
    // survey-scoping join below exists for.
    const pageInternalId = args.responseData.last_page_completed
      ? await resolveSurveyPageInternalId(survey.id, args.responseData.last_page_completed)
      : null;

    for (const answer of args.responseData.answers) {
      // Join the page so the question is always scoped to THIS survey, whether or
      // not `last_page_completed` resolved. Previously the page predicate was
      // conditional, so a submission without it matched `question_id` across the
      // whole table — the same cross-survey write as #2126, on the sibling path.
      const conditions = [
        eq(surveyQuestionTable.question_id, answer.question_id),
        eq(surveyPageTable.survey_id, survey.id),
      ];
      if (pageInternalId != null) {
        conditions.push(eq(surveyQuestionTable.page_id, pageInternalId));
      }

      const [question] = await db
        .select({ id: surveyQuestionTable.id })
        .from(surveyQuestionTable)
        .innerJoin(surveyPageTable, eq(surveyQuestionTable.page_id, surveyPageTable.id))
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
  surveyInternalId: number;
  resultId: string;
  completed: boolean;
}) {
  const nowIso = new Date().toISOString();
  try {
    const [response] = await db
      .update(surveyResponseTable)
      .set({
        completed_at: args.completed ? nowIso : null,
        updated_at: nowIso,
      })
      .where(
        and(
          eq(surveyResponseTable.survey_id, args.surveyInternalId),
          eq(surveyResponseTable.result_id, args.resultId),
        ),
      )
      .returning({ id: surveyResponseTable.id });
    if (!response) {
      return { ok: false as const, error: "Survey response not found", status: 404 };
    }
  } catch (error) {
    logger.error("Error completing survey:", error);
    return { ok: false as const, error: "Failed to complete survey", status: 500 };
  }

  return { ok: true as const, result_id: args.resultId };
}
