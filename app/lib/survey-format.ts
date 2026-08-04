/**
 * Client-safe survey display helpers.
 *
 * Separate from survey-db.server.ts because the responses route renders this in
 * the browser. Importing it from the .server module pulled drizzle and the
 * DATABASE_URL guard into the client bundle — caught by check:client-bundle,
 * which is the only gate that sees it (check:route-server-leaks does not).
 */

/**
 * Format survey answer for display, handling checkbox arrays
 */
export function formatSurveyAnswer(answer: {
  answer_value: string;
  survey_question?: { question_type: string } | null;
} | undefined): string {
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
}
