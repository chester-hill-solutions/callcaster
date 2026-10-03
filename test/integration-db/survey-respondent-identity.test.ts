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
  const publicId = randomUUID();
  const otherPublicId = randomUUID();
  const pageId = randomUUID();
  const questions = [randomUUID(), randomUUID(), randomUUID()];
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
    await client`insert into survey (survey_id, title, workspace, is_active) values (${otherPublicId}, 'Other survey', ${workspace}::uuid, true)`;
    const [page] = await client<{ id: number }[]>`insert into survey_page (survey_id, page_id, title, page_order) values (${surveyId}, ${pageId}, 'Questions', 1) returning id`;
    for (const [i, id] of questions.entries()) await client`insert into survey_question (page_id, question_id, question_text, question_type, is_required, question_order) values (${page.id}, ${id}, ${`Question ${i}`}, ${i === 1 ? 'checkbox' : 'text'}, false, ${i})`;
    ({ loader } = await import("@/routes/survey+/$surveyId.loader.server"));
    ({ action: answer } = await import("@/routes/api+/survey-answer.action.server"));
    ({ action: complete } = await import("@/routes/api+/survey-complete.action.server"));
    ({ resetRateLimitsForTests: resetLimits } = await import("@/lib/platform-rate-limit.server"));
  });
  beforeEach(async () => {
    resetLimits();
    await client`delete from response_answer using survey_response where response_answer.response_id = survey_response.id and survey_response.survey_id = ${surveyId}`;
    await client`delete from survey_response where survey_id = ${surveyId}`;
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
    for (const [i, questionId] of questions.entries()) {
      const result = await post(answer, { surveyId: publicId, questionId, pageId, answerValue: values[i], resultId: "forged-plain-id", respondent_token: first.body.respondentToken });
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
    expect(resumed.body.existingAnswers).toEqual({ [questions[0]]: "Yes", [questions[1]]: ["red", "blue"], [questions[2]]: '["literal text"]' });
    expect(await post(complete, { surveyId: publicId, completed: "true", respondent_token: resumed.body.respondentToken })).toMatchObject({ status: 200, body: { success: true, result_id: first.body.resultId } });
    const finished = await client`select completed_at from survey_response where survey_id = ${surveyId}`;
    expect(finished).toHaveLength(1);
    expect(finished[0].completed_at).not.toBeNull();
  });

  test("completion of an identity with no saved response fails and changes no other respondent", async () => {
    const first = await load();
    await post(answer, { surveyId: publicId, questionId: questions[0], pageId, answerValue: "Saved", respondent_token: first.body.respondentToken });
    const other = await load();
    const result = await post(complete, { surveyId: publicId, completed: "true", respondent_token: other.body.respondentToken, resultId: first.body.resultId });
    expect(result).toMatchObject({ status: 404, body: { error: "Survey response not found" } });
    const rows = await client`select result_id, completed_at from survey_response where survey_id = ${surveyId}`;
    expect(rows).toEqual([{ result_id: first.body.resultId, completed_at: null }]);
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
    expect(resumed.body.existingAnswers).toEqual({ [questions[0]]: "Original response" });
    const legacyResume = await load(undefined, publicId, contactId);
    expect(legacyResume.body.resultId).toBe("newer-contact-attempt");
  });

});
