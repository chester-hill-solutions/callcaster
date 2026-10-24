import { describe, expect, test } from "vitest";

import {
  households,
  question_option,
  response_answer,
  survey,
  survey_page,
  survey_question,
  survey_response,
} from "@/db/schema";

/**
 * The survey and household temporal columns are `timestamp with time zone` in
 * every real database and were declared `text()` in Drizzle until this slice
 * (#2213). They now come from `isoTimestamps()` or an equivalent
 * `timestamp({ withTimezone: true, mode: "string" })`, which keeps every caller
 * passing ISO strings exactly as before.
 *
 * This is the model-side half of the guarantee; `schema-type-drift.test.ts`
 * checks the same thing against a real database, and it fails on a stale
 * baseline entry as well as on fresh drift.
 */
const columns: Array<[string, { getSQLType(): string }]> = [
  ["survey.created_at", survey.created_at],
  ["survey.updated_at", survey.updated_at],
  ["survey_page.created_at", survey_page.created_at],
  ["survey_page.updated_at", survey_page.updated_at],
  ["survey_question.created_at", survey_question.created_at],
  ["survey_question.updated_at", survey_question.updated_at],
  ["survey_response.created_at", survey_response.created_at],
  ["survey_response.updated_at", survey_response.updated_at],
  ["survey_response.started_at", survey_response.started_at],
  ["survey_response.completed_at", survey_response.completed_at],
  ["question_option.created_at", question_option.created_at],
  ["response_answer.created_at", response_answer.created_at],
  ["response_answer.answered_at", response_answer.answered_at],
  ["households.created_at", households.created_at],
  ["households.updated_at", households.updated_at],
  ["households.last_contacted_at", households.last_contacted_at],
];

describe("survey and household timestamps (#2213)", () => {
  test.each(columns)("%s is timestamp with time zone", (_name, column) => {
    expect(column.getSQLType()).toBe("timestamp with time zone");
  });

  test("the database still supplies the defaults the model relies on", () => {
    // Created/updated pairs and the "now" singles carry the DB default, so an
    // insert may omit them; the nullable completions do not.
    expect(survey.created_at.hasDefault).toBe(true);
    expect(survey_response.started_at.hasDefault).toBe(true);
    expect(question_option.created_at.hasDefault).toBe(true);
    expect(survey_response.completed_at.hasDefault).toBe(false);
    expect(households.last_contacted_at.hasDefault).toBe(false);
  });
});
