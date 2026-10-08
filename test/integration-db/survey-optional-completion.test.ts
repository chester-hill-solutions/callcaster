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
import { normalizeRouteResult, routeArgs } from "../helpers/route-result";

const environment = vi.hoisted(() => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  };
  const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
  if (url) {
    process.env.DATABASE_URL = url;
    process.env.DATABASE_DIRECT_URL = url;
    process.env.BETTER_AUTH_SECRET = "optional-survey-fixture-secret";
  }
  return { url, previous };
});

const describeDb = environment.url ? describe : describe.skip;

describeDb("blank optional-only public survey completion (#2418)", () => {
  let sql: postgres.Sql;
  let complete: typeof import("@/routes/api+/survey-complete.action.server").action;
  let loader: typeof import("@/routes/survey+/$surveyId.loader.server").loader;
  let tokens: typeof import("@/lib/survey-respondent-token.server");
  let service: typeof import("@/lib/survey-db.server");
  let resetLimits: () => void;
  const workspace = randomUUID();
  const foreignWorkspace = randomUUID();
  const publicId = randomUUID();
  const foreignPublicId = randomUUID();
  let surveyId: number;
  let foreignSurveyId: number;
  let questionId: number;
  let contactId: number;
  let foreignContactId: number;

  beforeAll(async () => {
    if (!environment.url) throw new Error("A database URL is required");
    sql = postgres(environment.url, { max: 2 });
    await sql`insert into public.workspace (id, name, credits, twilio_data, feature_flags, disabled)
      values (${workspace}::uuid, 'Optional survey fixture', 100, '{}'::jsonb, '{}'::jsonb, false),
      (${foreignWorkspace}::uuid, 'Foreign survey fixture', 100, '{}'::jsonb, '{}'::jsonb, false)`;
    const [survey] =
      await sql`insert into public.survey (survey_id, title, workspace, is_active)
      values (${publicId}::uuid, 'Optional survey', ${workspace}::uuid, true) returning id`;
    surveyId = Number(survey.id);
    const [foreign] =
      await sql`insert into public.survey (survey_id, title, workspace, is_active)
      values (${foreignPublicId}::uuid, 'Foreign survey', ${foreignWorkspace}::uuid, true) returning id`;
    foreignSurveyId = Number(foreign.id);
    const [page] =
      await sql`insert into public.survey_page (survey_id, page_id, title, page_order)
      values (${surveyId}, ${randomUUID()}, 'Optional page', 1) returning id`;
    const [question] = await sql`insert into public.survey_question
      (page_id, question_id, question_text, question_type, is_required, question_order)
      values (${page.id}, ${randomUUID()}, 'Optional comment', 'text', false, 1) returning id`;
    questionId = Number(question.id);
    await sql`insert into public.survey_question
      (page_id, question_id, question_text, question_type, is_required, question_order)
      values (${page.id}, ${randomUUID()}, 'Another optional comment', 'text', false, 2)`;
    const [contact] =
      await sql`insert into public.contact (workspace, firstname, surname)
      values (${workspace}::uuid, 'Optional', 'Respondent') returning id`;
    contactId = Number(contact.id);
    const [foreignContact] =
      await sql`insert into public.contact (workspace, firstname, surname)
      values (${foreignWorkspace}::uuid, 'Foreign', 'Respondent') returning id`;
    foreignContactId = Number(foreignContact.id);
    ({ action: complete } =
      await import("@/routes/api+/survey-complete.action.server"));
    ({ loader } = await import("@/routes/survey+/$surveyId.loader.server"));
    tokens = await import("@/lib/survey-respondent-token.server");
    service = await import("@/lib/survey-db.server");
    ({ resetRateLimitsForTests: resetLimits } =
      await import("@/lib/platform-rate-limit.server"));
  });

  beforeEach(async () => {
    resetLimits();
    await sql`delete from public.survey_response where survey_id in (${surveyId}, ${foreignSurveyId})`;
    await sql`update public.survey set is_active = true where id = ${surveyId}`;
    await sql`update public.survey_question set is_required = false where id = ${questionId}`;
  });

  afterAll(async () => {
    try {
      if (sql)
        await sql`delete from public.workspace where id in (${workspace}::uuid, ${foreignWorkspace}::uuid)`;
    } finally {
      await sql?.end();
      if (service) {
        const { pool, directPool } = await import("@/server/db");
        await Promise.all([pool.end(), directPool.end()]);
      }
      for (const [key, value] of Object.entries(environment.previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  async function identity(contact?: number) {
    const request = new Request(
      `https://example.test/survey/${publicId}${contact ? `?contact=${contact}` : ""}`,
    );
    const result = await normalizeRouteResult(
      await loader(routeArgs(request, { surveyId: publicId }) as never),
    );
    expect(result.status).toBe(200);
    return result.body as { resultId: string; respondentToken: string };
  }

  async function submit(token: string, fields: Record<string, string> = {}) {
    const body = new FormData();
    for (const [key, value] of Object.entries({
      surveyId: publicId,
      completed: "true",
      respondent_token: token,
      ...fields,
    }))
      body.set(key, value);
    return normalizeRouteResult(
      await complete(
        routeArgs(
          new Request("https://example.test/api/survey-complete", {
            method: "POST",
            body,
          }),
        ) as never,
      ),
    );
  }

  const responses =
    () => sql`select id, result_id, contact_id, completed_at, started_at, last_page_completed
    from public.survey_response where survey_id = ${surveyId} order by id`;

  test("a loader-issued anonymous identity completes without an answer or posted result ID", async () => {
    const issued = await identity();
    expect(await responses()).toHaveLength(0);
    expect(
      await submit(issued.respondentToken, { resultId: "forged-result" }),
    ).toMatchObject({
      status: 200,
      body: { success: true, result_id: issued.resultId },
    });
    const rows = await responses();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      result_id: issued.resultId,
      contact_id: null,
    });
    expect(rows[0].completed_at).not.toBeNull();
    expect(
      await sql`select id from public.response_answer where response_id = ${rows[0].id}`,
    ).toHaveLength(0);
  });

  test("completion retry retains one response and its original completion time", async () => {
    const issued = await identity();
    expect((await submit(issued.respondentToken)).status).toBe(200);
    const first = await responses();
    expect((await submit(issued.respondentToken)).status).toBe(200);
    expect(await responses()).toEqual(first);
  });

  test("concurrent completion requests create exactly one completed response", async () => {
    const issued = await identity();
    const results = await Promise.all([
      submit(issued.respondentToken),
      submit(issued.respondentToken),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const rows = await responses();
    expect(rows).toHaveLength(1);
    expect(rows[0].completed_at).not.toBeNull();
  });

  test("contact-context blank completion stores the validated workspace contact", async () => {
    const issued = await identity(contactId);
    expect(
      (await submit(issued.respondentToken, { contactId: String(contactId) }))
        .status,
    ).toBe(200);
    const rows = await responses();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].contact_id)).toBe(contactId);
    expect(rows[0].result_id).toBe(issued.resultId);
    expect(rows[0].completed_at).not.toBeNull();
  });

  test("a historical contact response retains its timestamps and progress on completion retry", async () => {
    const resultId = randomUUID();
    await sql`insert into public.survey_response
      (survey_id, result_id, contact_id, started_at, completed_at, last_page_completed)
      values (${surveyId}, ${resultId}, ${contactId}, '2001-01-01T00:00:00Z', '2001-01-02T00:00:00Z', 'saved-page')`;
    const issued = await identity(contactId);
    expect(issued.resultId).toBe(resultId);
    const before = await responses();
    expect((await submit(issued.respondentToken)).status).toBe(200);
    expect(await responses()).toEqual(before);
  });

  test("a second signed identity cannot complete the first response with a forged result ID", async () => {
    const first = await identity();
    await sql`insert into public.survey_response (survey_id, result_id) values (${surveyId}, ${first.resultId})`;
    const second = await identity();
    expect(
      (await submit(second.respondentToken, { resultId: first.resultId }))
        .status,
    ).toBe(200);
    const rows = await responses();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.result_id).sort()).toEqual(
      [first.resultId, second.resultId].sort(),
    );
    expect(
      rows.find((row) => row.result_id === first.resultId)?.completed_at,
    ).toBeNull();
    expect(
      rows.find((row) => row.result_id === second.resultId)?.completed_at,
    ).toBeInstanceOf(Date);
  });

  test.each(["", "invalid-token"])(
    "rejects missing or invalid signed identity %j without creating a response",
    async (token) => {
      expect((await submit(token, { resultId: "forged-result" })).status).toBe(
        400,
      );
      expect(await responses()).toHaveLength(0);
    },
  );

  test("an expired signed identity creates no response", async () => {
    let expired: string;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2000-01-01T00:00:00Z"));
      ({ token: expired } = await tokens.createRespondentToken(
        surveyId,
        workspace,
      ));
    } finally {
      vi.useRealTimers();
    }
    expect((await submit(expired)).status).toBe(400);
    expect(await responses()).toHaveLength(0);
  });

  test("a token for another survey cannot create a response", async () => {
    const { token } = await tokens.createRespondentToken(
      foreignSurveyId,
      foreignWorkspace,
    );
    expect((await submit(token)).status).toBe(400);
    expect(await responses()).toHaveLength(0);
  });

  test("a same-survey token with a foreign workspace cannot create a response", async () => {
    const { token } = await tokens.createRespondentToken(
      surveyId,
      foreignWorkspace,
    );
    expect((await submit(token)).status).toBe(400);
    expect(await responses()).toHaveLength(0);
  });

  test("a contact from another workspace cannot create a response", async () => {
    const issued = await identity();
    expect(
      (
        await submit(issued.respondentToken, {
          contactId: String(foreignContactId),
        })
      ).status,
    ).toBe(400);
    expect(await responses()).toHaveLength(0);
  });

  test("an inactive survey creates no response", async () => {
    const issued = await identity();
    await sql`update public.survey set is_active = false where id = ${surveyId}`;
    expect((await submit(issued.respondentToken)).status).toBe(404);
    expect(await responses()).toHaveLength(0);
  });

  test("a required question without a saved answer cannot be completed", async () => {
    const issued = await identity();
    await sql`update public.survey_question set is_required = true where id = ${questionId}`;
    expect(await submit(issued.respondentToken)).toMatchObject({
      status: 400,
      body: { error: "Answer all required questions before submitting." },
    });
    const rows = await responses();
    expect(rows).toHaveLength(1);
    expect(rows[0].completed_at).toBeNull();
  });

  test("an incomplete update does not create an absent response", async () => {
    const issued = await identity();
    expect(
      (await submit(issued.respondentToken, { completed: "false" })).status,
    ).toBe(404);
    expect(await responses()).toHaveLength(0);
  });

  test("a saved required answer completes while the other optional question stays unanswered", async () => {
    const issued = await identity();
    await sql`update public.survey_question set is_required = true where id = ${questionId}`;
    const [response] =
      await sql`insert into public.survey_response (survey_id, result_id)
      values (${surveyId}, ${issued.resultId}) returning id`;
    await sql`insert into public.response_answer (response_id, question_id, answer_value)
      values (${response.id}, ${questionId}, 'A saved required answer')`;
    expect((await submit(issued.respondentToken)).status).toBe(200);
    const rows = await responses();
    expect(rows).toHaveLength(1);
    expect(rows[0].completed_at).not.toBeNull();
    expect(
      await sql`select question_id::text as question_id from public.response_answer where response_id = ${response.id}`,
    ).toEqual([{ question_id: String(questionId) }]);
  });

  test("the general completion writer still rejects an absent response", async () => {
    expect(
      await service.completeSurveyResponse({
        surveyInternalId: surveyId,
        resultId: randomUUID(),
        completed: true,
      }),
    ).toMatchObject({
      ok: false,
      status: 404,
      error: "Survey response not found",
    });
    expect(await responses()).toHaveLength(0);
  });

  test("a rejected response insert returns a safe failure and creates no completed response", async () => {
    const issued = await identity();
    const name = `optional_rejection_${randomUUID().replaceAll("-", "_")}`;
    await sql.unsafe(`create function public.${name}() returns trigger language plpgsql as $$
      begin
        if new.survey_id = ${surveyId} then raise exception 'Owned optional completion rejection'; end if;
        return new;
      end $$`);
    try {
      await sql.unsafe(`create trigger ${name} before insert on public.survey_response
        for each row execute function public.${name}()`);
      expect(await submit(issued.respondentToken)).toMatchObject({
        status: 500,
        body: { error: "Failed to create survey response" },
      });
      expect(await responses()).toHaveLength(0);
    } finally {
      await sql.unsafe(
        `drop trigger if exists ${name} on public.survey_response`,
      );
      await sql.unsafe(`drop function public.${name}()`);
    }
  });

  test("runtime pools and fixture use the selected database", async () => {
    const { pool, directPool } = await import("@/server/db");
    const [fixture] = await sql`select current_database() as name`;
    expect((await pool`select current_database() as name`)[0].name).toBe(
      fixture.name,
    );
    expect((await directPool`select current_database() as name`)[0].name).toBe(
      fixture.name,
    );
  });
});
