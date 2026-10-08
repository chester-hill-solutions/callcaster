import { randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

const environment = vi.hoisted(() => {
  const previous = {
    url: process.env.DATABASE_URL,
    direct: process.env.DATABASE_DIRECT_URL,
  };
  const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
  if (url) {
    process.env.DATABASE_URL = url;
    process.env.DATABASE_DIRECT_URL = url;
  }
  return { url, previous };
});

const describeDb = environment.url ? describe : describe.skip;

describeDb("required saved survey answers (#2107)", () => {
  let sql: postgres.Sql;
  let service: typeof import("@/lib/survey-db.server");
  const workspace = randomUUID();
  const publicId = randomUUID();
  const repeatedLabel = randomUUID();
  let surveyId: number;
  let foreignSurveyId: number;
  let responseId: number;
  let resultId: string;
  const questions: {
    id: number;
    label: string;
    page: string;
    type: string;
    value: string;
  }[] = [];

  beforeAll(async () => {
    if (!environment.url) throw new Error("A database URL is required");
    sql = postgres(environment.url, { max: 2 });
    await sql`insert into public.workspace (id, name, credits, twilio_data, feature_flags, disabled)
      values (${workspace}::uuid, 'Required answers fixture', 100, '{}'::jsonb, '{}'::jsonb, false)`;
    const surveys =
      await sql`insert into public.survey (survey_id, title, workspace, is_active)
      values (${publicId}::uuid, 'Required answers', ${workspace}::uuid, true),
      (${randomUUID()}::uuid, 'Foreign response control', ${workspace}::uuid, true) returning id`;
    [surveyId, foreignSurveyId] = surveys.map((row) => Number(row.id));
    for (const [index, type] of [
      "text",
      "checkbox",
      "radio",
      "textarea",
    ].entries()) {
      const page = randomUUID();
      const [pageRow] =
        await sql`insert into public.survey_page (survey_id, page_id, title, page_order)
        values (${surveyId}, ${page}, ${type}, ${index + 1}) returning id`;
      const label =
        type === "text" || type === "textarea" ? repeatedLabel : randomUUID();
      const [question] = await sql`insert into public.survey_question
        (page_id, question_id, question_text, question_type, is_required, question_order)
        values (${pageRow.id}, ${label}, ${type}, ${type}, true, 1) returning id`;
      questions.push({
        id: Number(question.id),
        label,
        page,
        type,
        value:
          type === "checkbox"
            ? '["yes"]'
            : type === "radio"
              ? "yes"
              : "A saved answer",
      });
      if (type === "checkbox" || type === "radio") {
        await sql`insert into public.question_option (question_id, option_value, option_label, option_order)
          values (${question.id}, 'yes', 'Yes', 1), (${question.id}, 'other', 'Other (write in)', 2)`;
      }
      await sql`insert into public.survey_question
        (page_id, question_id, question_text, question_type, is_required, question_order)
        values (${pageRow.id}, ${randomUUID()}, 'Optional answer', 'text', false, 2)`;
    }
    service = await import("@/lib/survey-db.server");
  });

  beforeEach(async () => {
    resultId = randomUUID();
    const [response] =
      await sql`insert into public.survey_response (survey_id, result_id)
      values (${surveyId}, ${resultId}) returning id`;
    responseId = Number(response.id);
    for (const question of questions) {
      await sql`insert into public.response_answer (response_id, question_id, answer_value)
        values (${responseId}, ${question.id}, ${question.value})`;
    }
  });

  afterAll(async () => {
    try {
      await sql`delete from public.response_answer using public.survey_response
        where response_answer.response_id = survey_response.id and survey_response.survey_id in (${surveyId}, ${foreignSurveyId})`;
      await sql`delete from public.survey_response where survey_id in (${surveyId}, ${foreignSurveyId})`;
      await sql`delete from public.question_option using public.survey_question, public.survey_page
        where question_option.question_id = survey_question.id and survey_question.page_id = survey_page.id and survey_page.survey_id = ${surveyId}`;
      await sql`delete from public.survey_question using public.survey_page
        where survey_question.page_id = survey_page.id and survey_page.survey_id = ${surveyId}`;
      await sql`delete from public.survey_page where survey_id = ${surveyId}`;
      await sql`delete from public.survey where id in (${surveyId}, ${foreignSurveyId})`;
      await sql`delete from public.workspace where id = ${workspace}::uuid`;
    } finally {
      await sql?.end();
      if (service) {
        const { pool, directPool } = await import("@/server/db");
        await Promise.all([pool.end(), directPool.end()]);
      }
      for (const [key, value] of Object.entries({
        DATABASE_URL: environment.previous.url,
        DATABASE_DIRECT_URL: environment.previous.direct,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  const complete = (completed = true) =>
    service.completeSurveyResponse({
      surveyInternalId: surveyId,
      resultId,
      completed,
    });
  const completionTime = async () =>
    (
      await sql`select completed_at from public.survey_response where id = ${responseId}`
    )[0].completed_at;
  async function replace(type: string, value: string | null) {
    const question = questions.find((row) => row.type === type);
    if (!question) throw new Error("Question fixture is missing");
    if (value === null)
      await sql`delete from public.response_answer where response_id = ${responseId} and question_id = ${question.id}`;
    else
      await sql`update public.response_answer set answer_value = ${value} where response_id = ${responseId} and question_id = ${question.id}`;
  }

  test("the runtime and fixture use the selected database", async () => {
    const { pool, directPool } = await import("@/server/db");
    const [expected] = await sql`select current_database() as name`;
    expect((await pool`select current_database() as name`)[0].name).toBe(
      expected.name,
    );
    expect((await directPool`select current_database() as name`)[0].name).toBe(
      expected.name,
    );
  });

  test.each([
    { type: "text", value: null },
    { type: "text", value: "" },
    { type: "text", value: " \n\t " },
    { type: "textarea", value: null },
    { type: "textarea", value: " \t " },
    { type: "radio", value: null },
    { type: "radio", value: "" },
    { type: "radio", value: "undeclared" },
    { type: "checkbox", value: null },
    { type: "checkbox", value: "[]" },
    { type: "checkbox", value: '[""]' },
    { type: "checkbox", value: '["undeclared"]' },
    { type: "checkbox", value: '["yes", 1]' },
    { type: "checkbox", value: "not JSON" },
  ])(
    "rejects required $type value $value without marking completion",
    async ({ type, value }) => {
      await replace(type, value);
      expect(await complete()).toMatchObject({
        ok: false,
        status: 400,
        error: "Answer all required questions before submitting.",
      });
      expect(await completionTime()).toBeNull();
    },
  );

  test("valid saved answers complete with every optional answer absent", async () => {
    expect((await complete()).ok).toBe(true);
    expect(await completionTime()).not.toBeNull();
  });
  test.each([
    { type: "radio", value: "other: My choice" },
    { type: "checkbox", value: '["yes", "other: My choice"]' },
  ])(
    "accepts the stored $type write-in wire format",
    async ({ type, value }) => {
      await replace(type, value);
      expect((await complete()).ok).toBe(true);
      expect(await completionTime()).not.toBeNull();
    },
  );
  test("a repeated question label on another page cannot supply a missing answer", async () => {
    await replace("textarea", null);
    expect((await complete()).ok).toBe(false);
    expect(await completionTime()).toBeNull();
  });
  test("another respondent's valid answers cannot complete this respondent", async () => {
    const other =
      await sql`insert into public.survey_response (survey_id, result_id) values (${surveyId}, ${randomUUID()}) returning id`;
    await sql`update public.response_answer set response_id = ${other[0].id} where response_id = ${responseId}`;
    expect((await complete()).ok).toBe(false);
    expect(await completionTime()).toBeNull();
  });
  test("a matching result ID in another survey stays incomplete", async () => {
    const [other] =
      await sql`insert into public.survey_response (survey_id, result_id) values (${foreignSurveyId}, ${resultId}) returning id`;
    expect((await complete()).ok).toBe(true);
    expect(await completionTime()).not.toBeNull();
    expect(
      (
        await sql`select completed_at from public.survey_response where id = ${other.id}`
      )[0].completed_at,
    ).toBeNull();
  });
  test("retry preserves a historical completion after required answers change", async () => {
    await replace("text", null);
    await sql`update public.survey_response set completed_at = '2026-01-01T00:00:00Z' where id = ${responseId}`;
    expect((await complete()).ok).toBe(true);
    expect(new Date(await completionTime()).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
  test("marking a response incomplete does not require answers", async () => {
    await replace("text", null);
    expect((await complete(false)).ok).toBe(true);
    expect(await completionTime()).toBeNull();
  });
  test("missing response keeps its 404 contract", async () => {
    resultId = randomUUID();
    expect(await complete()).toMatchObject({ ok: false, status: 404 });
  });
  test("the response API writer rejects missing required answers on an existing response", async () => {
    await replace("text", null);
    expect(
      await service.submitSurveyResponse({
        surveyPublicId: publicId,
        responseData: { result_id: resultId, completed: true },
      }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(await completionTime()).toBeNull();
  });
  test("the response API writer creates an incomplete row when required answers are absent", async () => {
    const newResultId = randomUUID();
    expect(
      await service.submitSurveyResponse({
        surveyPublicId: publicId,
        responseData: { result_id: newResultId, completed: true },
      }),
    ).toMatchObject({ ok: false, status: 400 });
    const [row] =
      await sql`select completed_at from public.survey_response where survey_id = ${surveyId} and result_id = ${newResultId}`;
    expect(row.completed_at).toBeNull();
  });
  test("the response API writer completes valid persisted answers", async () => {
    expect(
      (
        await service.submitSurveyResponse({
          surveyPublicId: publicId,
          responseData: { result_id: resultId, completed: true },
        })
      ).ok,
    ).toBe(true);
    expect(await completionTime()).not.toBeNull();
  });
});
