import { and, eq, inArray } from "drizzle-orm";
import {
  question_option as optionTable,
  response_answer as answerTable,
  survey_page as pageTable,
  survey_question as questionTable,
  survey_response as responseTable,
} from "@/db/schema";
import { hasRequiredSurveyAnswer } from "@/lib/survey-required-answer";
import { logger } from "@/lib/logger.server";
import { db } from "./db";

export async function completeSurveyResponse(args: {
  surveyInternalId: number;
  resultId: string;
  completed: boolean;
}) {
  try {
    return await db.transaction(async (tx) => {
      const [response] = await tx
        .select({
          id: responseTable.id,
          completedAt: responseTable.completed_at,
        })
        .from(responseTable)
        .where(
          and(
            eq(responseTable.survey_id, args.surveyInternalId),
            eq(responseTable.result_id, args.resultId),
          ),
        )
        .for("update");
      if (!response)
        return {
          ok: false as const,
          error: "Survey response not found",
          status: 404,
        };
      // A retry must not invalidate historical responses after the survey changes.
      if (args.completed && response.completedAt)
        return { ok: true as const, result_id: args.resultId };

      if (args.completed) {
        const required = await tx
          .select({
            id: questionTable.id,
            question_type: questionTable.question_type,
            value: answerTable.answer_value,
          })
          .from(questionTable)
          .innerJoin(pageTable, eq(questionTable.page_id, pageTable.id))
          .leftJoin(
            answerTable,
            and(
              eq(answerTable.question_id, questionTable.id),
              eq(answerTable.response_id, response.id),
            ),
          )
          .where(
            and(
              eq(pageTable.survey_id, args.surveyInternalId),
              eq(questionTable.is_required, true),
            ),
          );
        const options = required.length
          ? await tx
              .select()
              .from(optionTable)
              .where(
                inArray(
                  optionTable.question_id,
                  required.map((question) => question.id),
                ),
              )
          : [];
        const missing = required.some(
          (question) =>
            !hasRequiredSurveyAnswer(
              {
                question_type: question.question_type,
                question_option: options.filter(
                  (option) => option.question_id === question.id,
                ),
              },
              question.value,
            ),
        );
        if (missing)
          return {
            ok: false as const,
            error: "Answer all required questions before submitting.",
            status: 400,
          };
      }

      const now = new Date().toISOString();
      await tx
        .update(responseTable)
        .set({ completed_at: args.completed ? now : null, updated_at: now })
        .where(
          and(
            eq(responseTable.id, response.id),
            eq(responseTable.survey_id, args.surveyInternalId),
            eq(responseTable.result_id, args.resultId),
          ),
        );
      return { ok: true as const, result_id: args.resultId };
    });
  } catch (error) {
    logger.error("Error completing survey:", error);
    return {
      ok: false as const,
      error: "Failed to complete survey",
      status: 500,
    };
  }
}
