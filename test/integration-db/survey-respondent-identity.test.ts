import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { normalizeRouteResult, routeArgs } from "../helpers/route-result";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const { clientRef } = vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET ??= "survey-identity-test-secret";
  return { clientRef: { current: null as unknown } };
});
vi.mock("@/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db")>()),
  get db() { return drizzle(clientRef.current as never); },
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
if (!databaseUrl) process.stderr.write("Survey identity SQL proof skipped: INTEGRATION_DB_URL is required.\n");

const describeDb = databaseUrl ? describe : describe.skip;
describeDb("public survey respondent continuity (#2125)", () => {
  let client: postgres.Sql;
  let workspace: string;
  let surveyId: number;
  let otherSurveyId: number;
  const publicId = randomUUID();
  const otherPublicId = randomUUID();
  const pageId = randomUUID();
  const questions = ["question-1", "question-2", "question-3", "question-4"];
  const secondPageId = randomUUID();
  let loader: typeof import("@/routes/survey+/$surveyId.loader.server").loader;
  let answer: typeof import("@/routes/api+/survey-answer.action.server").action;
  let complete: typeof import("@/routes/api+/survey-complete.action.server").action;
  let resetLimits: () => void;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Missing isolated test database URL");
    client = postgres(databaseUrl, { prepare: false, onnotice: () => {} });
    clientRef.current = client;
    const [ws] = await client<{ id: string }[]>`insert into workspace (name, credits, twilio_data, feature_flags, disabled) values ('Survey identity proof', 100, '{}'::jsonb, '{}'::jsonb, false) returning id::text`;
    workspace = ws.id;
    const [survey] = await client<{ id: number }[]>`insert into survey (survey_id, title, workspace, is_active) values (${publicId}, 'Identity proof', ${workspace}::uuid, true) returning id`;
    surveyId = Number(survey.id);
    const [otherSurvey] = await client<{ id: number }[]>`insert into survey (survey_id, title, workspace, is_active) values (${otherPublicId}, 'Other survey', ${workspace}::uuid, true) returning id`;
    otherSurveyId = Number(otherSurvey.id);
    const [page] = await client<{ id: number }[]>`insert into survey_page (survey_id, page_id, title, page_order) values (${surveyId}, ${pageId}, 'Questions', 1) returning id`;
    for (const [i, id] of questions.entries()) await client`insert into survey_question (page_id, question_id, question_text, question_type, is_required, question_order) values (${page.id}, ${id}, ${`Question ${i}`}, ${i === 1 ? 'checkbox' : i === 3 ? 'radio' : 'text'}, false, ${i})`;
    const [secondPage] = await client<{ id: number }[]>`insert into survey_page (survey_id, page_id, title, page_order) values (${surveyId}, ${secondPageId}, 'Second page', 2) returning id`;
    for (const [i, id] of questions.entries()) await client`insert into survey_question (page_id, question_id, question_text, question_type, is_required, question_order) values (${secondPage.id}, ${id}, ${`Second question ${i}`}, ${i === 1 ? 'checkbox' : i === 3 ? 'radio' : 'text'}, false, ${i})`;
    const [singlePage] = await client<{ id: number }[]>`insert into survey_page (survey_id, page_id, title, page_order) values (${otherSurveyId}, ${pageId}, 'Single page', 1) returning id`;
    await client`insert into survey_question (page_id, question_id, question_text, question_type, is_required, question_order) values (${singlePage.id}, ${questions[0]}, 'Single question', 'text', false, 1)`;
    for (const currentPage of [page, secondPage]) {
      const choiceQuestions = await client<{ id: number }[]>`select id from survey_question where page_id = ${currentPage.id} and question_type in ('checkbox', 'radio')`;
      for (const question of choiceQuestions) await client`insert into question_option (question_id, option_value, option_label, option_order) values (${question.id}, 'yes', 'Yes', 1), (${question.id}, 'other', 'Other (write in)', 2)`;
    }
    ({ loader } = await import("@/routes/survey+/$surveyId.loader.server"));
    ({ action: answer } = await import("@/routes/api+/survey-answer.action.server"));
    ({ action: complete } = await import("@/routes/api+/survey-complete.action.server"));
    ({ resetRateLimitsForTests: resetLimits } = await import("@/lib/platform-rate-limit.server"));
  });
  beforeEach(async () => {
    resetLimits();
    await client`delete from response_answer using survey_response where response_answer.response_id = survey_response.id and survey_response.survey_id in (${surveyId}, ${otherSurveyId})`;
    await client`delete from survey_response where survey_id in (${surveyId}, ${otherSurveyId})`;
  });
  afterAll(async () => {
    if (!client) return;
    try { if (workspace) await client`delete from workspace where id = ${workspace}::uuid`; }
    finally { await client.end({ timeout: 5 }); }
  });

  async function load(cookie?: string, id = publicId, contactId?: number) {
    const request = new Request(`https://example.test/survey/${id}${contactId ? `?contact=${contactId}` : ""}`, { headers: cookie ? { Cookie: cookie } : {} });
    const result = await normalizeRouteResult(await loader(routeArgs(request, { surveyId: id }) as never));
    expect(result, JSON.stringify(result.body)).toMatchObject({ status: 200 });
    const issuedCookie = result.headers.get("Set-Cookie");
    if (!issuedCookie) throw new Error("Survey loader did not issue its identity cookie");
    return { body: result.body as { resultId: string; respondentToken: string; existingAnswers: Record<string, string | string[]> }, cookie: issuedCookie.split(";")[0] };
  }
  async function post(action: typeof answer | typeof complete, fields: Record<string, string>) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    return normalizeRouteResult(await action(routeArgs(new Request("https://example.test/api/survey", { method: "POST", body })) as never));
  }

  test("three acknowledged answers, reload and completion use one anonymous response", async () => {
    const first = await load();
    const values = ["Yes", '["red","blue"]', '["literal text"]'];
    for (const [i, value] of values.entries()) {
      const questionId = questions[i];
      const result = await post(answer, { surveyId: publicId, questionId, pageId, answerValue: value, resultId: "forged-plain-id", respondent_token: first.body.respondentToken });
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ success: true, result_id: first.body.resultId });
    }
    const responses = await client`select id, result_id, contact_id, completed_at from survey_response where survey_id = ${surveyId}`;
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ result_id: first.body.resultId, contact_id: null, completed_at: null });
    const stored = await client`select answer_value from response_answer where response_id = ${responses[0].id} order by id`;
    expect(stored.map(row => row.answer_value)).toEqual(values);
    const resumed = await load(first.cookie);
    expect(resumed.body.resultId).toBe(first.body.resultId);
    expect(resumed.body.respondentToken).toBe(first.body.respondentToken);
    expect(resumed.body.existingAnswers).toEqual({ [JSON.stringify([pageId, questions[0]])]: "Yes", [JSON.stringify([pageId, questions[1]])]: ["red", "blue"], [JSON.stringify([pageId, questions[2]])]: '["literal text"]' });
    expect(await post(complete, { surveyId: publicId, completed: "true", respondent_token: resumed.body.respondentToken })).toMatchObject({ status: 200, body: { success: true, result_id: first.body.resultId } });
    const finished = await client`select completed_at from survey_response where survey_id = ${surveyId}`;
    expect(finished).toHaveLength(1);
    expect(finished[0].completed_at).not.toBeNull();
  });

  test("blank completion creates its own signed response and changes no other respondent", async () => {
    const first = await load();
    await post(answer, { surveyId: publicId, questionId: questions[0], pageId, answerValue: "Saved", respondent_token: first.body.respondentToken });
    const other = await load();
    const result = await post(complete, { surveyId: publicId, completed: "true", respondent_token: other.body.respondentToken, resultId: first.body.resultId });
    expect(result).toMatchObject({ status: 200, body: { success: true, result_id: other.body.resultId } });
    const rows = await client`select result_id, completed_at is not null as completed from survey_response where survey_id = ${surveyId}`;
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      { result_id: first.body.resultId, completed: false },
      { result_id: other.body.resultId, completed: true },
    ]));
  });

  test("another survey's signed identity cannot write to this survey", async () => {
    const other = await load(undefined, otherPublicId);
    const result = await post(answer, { surveyId: publicId, questionId: questions[0], pageId, answerValue: "Wrong survey", respondent_token: other.body.respondentToken });
    expect(result.status).toBe(400);
    expect(await client`select id from survey_response where survey_id = ${surveyId}`).toHaveLength(0);
  });
  test("a contact cookie keeps its response even when a newer contact response exists", async () => {
    const [contact] = await client<{ id: number }[]>`insert into contact (workspace, firstname, surname) values (${workspace}::uuid, 'Contact', 'Resume') returning id`;
    const contactId = Number(contact.id);
    const first = await load(undefined, publicId, contactId);
    expect(await post(answer, { surveyId: publicId, questionId: questions[0], pageId, answerValue: "Original response", contactId: String(contactId), respondent_token: first.body.respondentToken })).toMatchObject({ status: 200 });
    await client`insert into survey_response (survey_id, result_id, contact_id, created_at) values (${surveyId}, 'newer-contact-attempt', ${contactId}, now() + interval '1 minute')`;
    const resumed = await load(first.cookie, publicId, contactId);
    expect(resumed.body.resultId).toBe(first.body.resultId);
    expect(resumed.body.respondentToken).toBe(first.body.respondentToken);
    expect(resumed.body.existingAnswers).toEqual({ [JSON.stringify([pageId, questions[0]])]: "Original response" });
    const legacyResume = await load(undefined, publicId, contactId);
    expect(legacyResume.body.resultId).toBe("newer-contact-attempt");
  });

  test("reload keeps repeated labels, checkbox arrays and write-in text on their own page", async () => {
    const first = await load();
    const values = [
      [pageId, questions[0], "First page text"],
      [secondPageId, questions[0], "Second page text"],
      [pageId, questions[1], '["yes","other: First detail"]'],
      [secondPageId, questions[1], '["other: Second detail"]'],
      [pageId, questions[3], 'other: First radio detail'],
      [secondPageId, questions[3], 'other: Second radio detail'],
    ];
    for (const [currentPage, questionId, value] of values) {
      expect(await post(answer, { surveyId: publicId, questionId, pageId: currentPage, answerValue: value, respondent_token: first.body.respondentToken })).toMatchObject({ status: 200 });
    }
    const resumed = await load(first.cookie);
    expect(resumed.body.resultId).toBe(first.body.resultId);
    expect(resumed.body.existingAnswers).toEqual({
      [JSON.stringify([pageId, questions[0]])]: "First page text",
      [JSON.stringify([secondPageId, questions[0]])]: "Second page text",
      [JSON.stringify([pageId, questions[1]])]: ["yes", "other: First detail"],
      [JSON.stringify([secondPageId, questions[1]])]: ["other: Second detail"],
      [JSON.stringify([pageId, questions[3]])]: "other: First radio detail",
      [JSON.stringify([secondPageId, questions[3]])]: "other: Second radio detail",
    });
    expect(await client`select id from survey_response where survey_id = ${surveyId}`).toHaveLength(1);
  });

  test("a saved answer creates no resumed value for the other page's same label", async () => {
    const first = await load();
    expect(await post(answer, { surveyId: publicId, questionId: questions[0], pageId, answerValue: "Only first page", respondent_token: first.body.respondentToken })).toMatchObject({ status: 200 });
    const resumed = await load(first.cookie);
    expect(resumed.body.existingAnswers).toEqual({ [JSON.stringify([pageId, questions[0]])]: "Only first page" });
    expect(resumed.body.existingAnswers[JSON.stringify([secondPageId, questions[0]])]).toBeUndefined();
  });

  test("an identity with no stored answers resumes an empty map", async () => {
    const first = await load();
    const resumed = await load(first.cookie);
    expect(resumed.body.resultId).toBe(first.body.resultId);
    expect(resumed.body.existingAnswers).toEqual({});
  });

  test("a single-page survey retains a literal text answer and signed identity on reload", async () => {
    const first = await load(undefined, otherPublicId);
    expect(await post(answer, { surveyId: otherPublicId, questionId: questions[0], pageId, answerValue: "other: Literal text", respondent_token: first.body.respondentToken })).toMatchObject({ status: 200 });
    const resumed = await load(first.cookie, otherPublicId);
    expect(resumed.body.resultId).toBe(first.body.resultId);
    expect(resumed.body.respondentToken).toBe(first.body.respondentToken);
    expect(resumed.body.existingAnswers).toEqual({ [JSON.stringify([pageId, questions[0]])]: "other: Literal text" });
  });

  test("resume ignores a foreign survey question with the same page/question labels without changing stored rows", async () => {
    const first = await load();
    expect(await post(answer, { surveyId: publicId, questionId: questions[0], pageId, answerValue: "Owned answer", respondent_token: first.body.respondentToken })).toMatchObject({ status: 200 });
    const [response] = await client<{ id: number }[]>`select id from survey_response where survey_id = ${surveyId} and result_id = ${first.body.resultId}`;
    const [foreignQuestion] = await client<{ id: number }[]>`select sq.id from survey_question sq join survey_page sp on sp.id = sq.page_id where sp.survey_id = ${otherSurveyId} and sq.question_id = ${questions[0]}`;
    await client`insert into response_answer (response_id, question_id, answer_value) values (${response.id}, ${foreignQuestion.id}, 'Foreign answer')`;
    const resumed = await load(first.cookie);
    expect(resumed.body.existingAnswers).toEqual({ [JSON.stringify([pageId, questions[0]])]: "Owned answer" });
    expect(await client`select answer_value from response_answer where response_id = ${response.id} order by id`).toEqual([{ answer_value: "Owned answer" }, { answer_value: "Foreign answer" }]);
  });

});
