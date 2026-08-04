import { and, eq, notInArray } from "drizzle-orm";

import {
  survey as surveyTable,
  survey_page as surveyPageTable,
  survey_question as surveyQuestionTable,
  question_option as questionOptionTable,
} from "@/db/schema";
import { db, type Database } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import type { SurveyFormData } from "@/lib/types";

/**
 * Survey structure writes (title/active + the page/question/option tree),
 * extracted from survey-db.server.ts to keep that file under the size ratchet.
 * updateSurveyMetadata is re-exported from survey-db.server.ts for back-compat.
 */

export async function updateSurveyMetadata(args: {
  workspaceId: string;
  surveyPublicId: string;
  title: string;
  is_active: boolean;
  pages?: SurveyFormData["pages"];
}) {
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const tdb = createTenantDb(args.workspaceId, tx);
    const nowIso = new Date().toISOString();

    const rows = await tdb.survey.update({
      set: {
        title: args.title,
        is_active: args.is_active,
        updated_at: nowIso,
      },
      where: eq(surveyTable.survey_id, args.surveyPublicId),
    });
    const survey = rows[0] ?? null;

    if (!survey || !args.pages) {
      return survey;
    }

    await syncSurveyStructure(tx, survey.id, args.pages, nowIso);

    return survey;
  });
}

async function syncSurveyStructure(
  tx: Database,
  surveyInternalId: number,
  pages: SurveyFormData["pages"],
  nowIso: string,
) {
  const incomingPageIds = pages.map((page) => page.page_id);

  if (incomingPageIds.length > 0) {
    await tx
      .delete(surveyPageTable)
      .where(
        and(
          eq(surveyPageTable.survey_id, surveyInternalId),
          notInArray(surveyPageTable.page_id, incomingPageIds),
        ),
      );
  } else {
    await tx.delete(surveyPageTable).where(eq(surveyPageTable.survey_id, surveyInternalId));
  }

  for (const page of pages) {
    const [pageRow] = await tx
      .insert(surveyPageTable)
      .values({
        survey_id: surveyInternalId,
        page_id: page.page_id,
        title: page.title,
        page_order: page.page_order,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .onConflictDoUpdate({
        target: [surveyPageTable.survey_id, surveyPageTable.page_id],
        set: {
          title: page.title,
          page_order: page.page_order,
          updated_at: nowIso,
        },
      })
      .returning();

    if (!pageRow) {
      continue;
    }

    const questions = page.questions ?? [];
    const incomingQuestionIds = questions.map((question) => question.question_id);

    if (incomingQuestionIds.length > 0) {
      await tx
        .delete(surveyQuestionTable)
        .where(
          and(
            eq(surveyQuestionTable.page_id, pageRow.id),
            notInArray(surveyQuestionTable.question_id, incomingQuestionIds),
          ),
        );
    } else {
      await tx.delete(surveyQuestionTable).where(eq(surveyQuestionTable.page_id, pageRow.id));
    }

    for (const question of questions) {
      const [questionRow] = await tx
        .insert(surveyQuestionTable)
        .values({
          page_id: pageRow.id,
          question_id: question.question_id,
          question_text: question.question_text,
          question_type: question.question_type,
          is_required: question.is_required,
          question_order: question.question_order,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .onConflictDoUpdate({
          target: [surveyQuestionTable.page_id, surveyQuestionTable.question_id],
          set: {
            question_text: question.question_text,
            question_type: question.question_type,
            is_required: question.is_required,
            question_order: question.question_order,
            updated_at: nowIso,
          },
        })
        .returning();

      if (!questionRow) {
        continue;
      }

      const options = question.options ?? [];
      const incomingOptionValues = options.map((option) => option.option_value);

      if (incomingOptionValues.length > 0) {
        await tx
          .delete(questionOptionTable)
          .where(
            and(
              eq(questionOptionTable.question_id, questionRow.id),
              notInArray(questionOptionTable.option_value, incomingOptionValues),
            ),
          );
      } else {
        await tx.delete(questionOptionTable).where(eq(questionOptionTable.question_id, questionRow.id));
      }

      for (const option of options) {
        await tx
          .insert(questionOptionTable)
          .values({
            question_id: questionRow.id,
            option_value: option.option_value,
            option_label: option.option_label,
            option_order: option.option_order,
            created_at: nowIso,
          })
          .onConflictDoUpdate({
            target: [questionOptionTable.question_id, questionOptionTable.option_value],
            set: {
              option_label: option.option_label,
              option_order: option.option_order,
            },
          });
      }
    }
  }
}
