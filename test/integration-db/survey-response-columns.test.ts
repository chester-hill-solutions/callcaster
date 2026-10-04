import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const previousDatabaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
if (!databaseUrl) process.stderr.write("Survey CSV column proof skipped: INTEGRATION_DB_URL is required.\n");

type Fixture = { publicId: string; surveyId: number; questionIds: number[] };
type Question = { label: string; text: string; type: string };

suite("survey CSV columns use saved question identity (#2317)", () => {
  let client: postgres.Sql;
  let workspaceId: string;
  let foreignWorkspaceId: string;
  let repeated: Fixture;
  let single: Fixture;
  let buildCsv: typeof import("@/lib/survey-responses.server").buildSurveyResponsesCsv;

  async function createSurvey(pages: Question[][]): Promise<Fixture> {
    const publicId = randomUUID();
    const [survey] = await client<{ id: number }[]>`insert into survey (survey_id, title, workspace, is_active)
      values (${publicId}, 'Column identity', ${workspaceId}::uuid, true) returning id`;
    const questionIds: number[] = [];
    for (const [i, questions] of pages.entries()) {
      const [page] = await client<{ id: number }[]>`insert into survey_page (survey_id, page_id, title, page_order)
        values (${survey.id}, ${randomUUID()}, ${`Page ${i + 1}`}, ${i + 1}) returning id`;
      for (const [j, question] of questions.entries()) {
        const [saved] = await client<{ id: number }[]>`insert into survey_question (page_id, question_id, question_text, question_type, question_order)
          values (${page.id}, ${question.label}, ${question.text}, ${question.type}, ${j + 1}) returning id`;
        questionIds.push(Number(saved.id));
      }
    }
    return { publicId, surveyId: Number(survey.id), questionIds };
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Missing isolated test database URL");
    process.env.DATABASE_URL = databaseUrl;
    ({ pool: client } = await import("@/server/db"));
    ({ buildSurveyResponsesCsv: buildCsv } = await import("@/lib/survey-responses.server"));
    const rows = await client<{ id: string }[]>`insert into workspace (name, credits, twilio_data, feature_flags, disabled)
      values ('Survey CSV column proof', 100, '{}'::jsonb, '{}'::jsonb, false),
             ('Foreign CSV column proof', 100, '{}'::jsonb, '{}'::jsonb, false) returning id::text`;
    workspaceId = rows[0].id;
    foreignWorkspaceId = rows[1].id;
    repeated = await createSurvey([
      [{ label: "question-1", text: "First question", type: "text" }],
      [{ label: "question-1", text: "Second question", type: "text" }],
    ]);
    single = await createSurvey([[
      { label: "question-1", text: "Choices", type: "checkbox" },
      { label: "question-2", text: "Literal text", type: "text" },
    ]]);
  });

  beforeEach(async () => {
    await client`delete from response_answer using survey_response where response_answer.response_id = survey_response.id
      and survey_response.survey_id in (${repeated.surveyId}, ${single.surveyId})`;
    await client`delete from survey_response where survey_id in (${repeated.surveyId}, ${single.surveyId})`;
  });

  afterAll(async () => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (!client) return;
    try {
      if (workspaceId) await client`delete from workspace where id in (${workspaceId}::uuid, ${foreignWorkspaceId}::uuid)`;
    } finally {
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
    }
  });

  async function saveAnswers(fixture: Fixture, values: (string | null)[]) {
    const [response] = await client<{ id: number }[]>`insert into survey_response (survey_id, result_id, contact_id, started_at)
      values (${fixture.surveyId}, ${randomUUID()}, null, '2026-10-01T12:00:00Z') returning id`;
    for (const [i, value] of values.entries()) {
      if (value !== null) await client`insert into response_answer (response_id, question_id, answer_value)
        values (${response.id}, ${fixture.questionIds[i]}, ${value})`;
    }
  }

  async function exportRows(fixture = repeated) {
    const result = await buildCsv({ workspaceId, surveyId: fixture.publicId });
    if (!result.ok) throw new Error(result.error);
    const rows: string[][] = parse(result.csv, { bom: true });
    return rows;
  }

  test("two repeated labels export two different saved answers under the original headers", async () => {
    await saveAnswers(repeated, ["First answer", "Second answer"]);
    const rows = await exportRows();
    expect(rows[0]).toEqual(["Respondent", "Status", "Started", "Completed", "Last Page", "First question", "Second question"]);
    expect(rows[1].slice(5)).toEqual(["First answer", "Second answer"]);
    expect(rows).toHaveLength(2);
  });

  test.each([
    { values: ["First answer", null], expected: ["First answer", "'-"] },
    { values: [null, "Second answer"], expected: ["'-", "Second answer"] },
  ])("an unanswered saved question stays empty: $expected", async ({ values, expected }) => {
    await saveAnswers(repeated, values);
    expect((await exportRows())[1].slice(5)).toEqual(expected);
  });

  test("single-page checkbox formatting and quoted text survive CSV parsing", async () => {
    await saveAnswers(single, ['["North","South"]', 'Literal, "quoted" text']);
    const rows = await exportRows(single);
    expect(rows[0].slice(5)).toEqual(["Choices", "Literal text"]);
    expect(rows[1].slice(5)).toEqual(["North, South", 'Literal, "quoted" text']);
  });

  test("another workspace cannot export an existing survey or its answers", async () => {
    await saveAnswers(repeated, ["Private first answer", "Private second answer"]);
    expect(await buildCsv({ workspaceId: foreignWorkspaceId, surveyId: repeated.publicId }))
      .toEqual({ ok: false, error: "Survey not found", status: 404 });
    expect((await exportRows())[1].slice(5)).toEqual(["Private first answer", "Private second answer"]);
  });

  test("a missing survey returns 404", async () => {
    expect(await buildCsv({ workspaceId, surveyId: randomUUID() }))
      .toEqual({ ok: false, error: "Survey not found", status: 404 });
  });

  test("an empty survey export retains the column headers", async () => {
    const rows = await exportRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].slice(5)).toEqual(["First question", "Second question"]);
  });
});
