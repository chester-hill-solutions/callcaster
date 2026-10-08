import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

/**
 * #2126 — a public survey answer could land on another survey's question.
 *
 * `survey_question.question_id` is a short per-page label. Two surveys in
 * different workspaces both contain a `question-1`, and `saveSurveyAnswer`
 * resolved it with:
 *
 *   select id from survey_question where question_id = $1 limit 1
 *
 * No page, no survey, no `ORDER BY` — so Postgres returns *an arbitrary* row from
 * the whole table. An anonymous caller naming another tenant's `question-1` had
 * their answer stored against that tenant's question, where it renders in the
 * wrong survey's results and CSV export.
 *
 * ## Why this tier
 *
 * The defect is entirely in the query's predicates, so a mocked db client cannot
 * observe it: any mock that returns a row for `question-1` returns the same row
 * whether or not the lookup is scoped. Only a real database can prove *which* row
 * a predicate set selects, which is exactly what the two tenants below exist to
 * distinguish.
 *
 * Two surveys are created in **two different workspaces**, each with one page
 * labelled `page-1` holding one question labelled `question-1`. That is the real
 * shape of the collision: identical labels, no shared scope.
 *
 * ## Both tenants are asserted, and only one fails under the bug
 *
 * With the unscoped lookup, `where question_id = 'question-1' limit 1` returns one
 * row for the *whole table*. Whichever tenant's question Postgres reaches first
 * is the one every answer lands on — so one tenant is served correctly **by
 * accident of insertion order** and the other is corrupted. That means a
 * single-tenant test would pass on the buggy code roughly half the time, which
 * is worse than no test.
 *
 * Asserting both makes the failure deterministic: the survey inserted second is
 * the one the unscoped lookup cannot reach. Kill-checked by restoring
 * `where eq(question_id, ?)` — `the same label answered on survey B lands on
 * survey B's question` goes red while the other four stay green.
 *
 * `db` is injected by mocking `@/server/db` with a client this suite owns, so
 * the module under test reads the same connection the fixtures were written on.
 */

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Written straight to stderr on purpose: vitest's console interceptor
  // swallows module-scope `console.warn`, and a skip nobody sees is how an
  // unscoped cross-tenant lookup gets mistaken for a tested one.
  process.stderr.write(
    [
      "",
      "!".repeat(72),
      "!! integration-db SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.",
      "!!",
      "!! test/integration-db/survey-answer-question-scope.test.ts is the ONLY",
      "!! test that proves saveSurveyAnswer cannot write an answer onto another",
      "!! survey's question. Skipping it means the cross-tenant write is",
      "!! UNVERIFIED (#2126).",
      "!!",
      "!! To run it:",
      "!!   docker compose -f docker-compose.dev.yml up -d postgres",
      "!!   export DATABASE_URL=postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster",
      "!!   node scripts/e2e/bootstrap-compose-db.mjs",
      "!!   npm run test:integration-db",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

// Hoisted so `@/server/db` resolves this suite's client rather than opening its
// own pool at import time — the fixtures and the code under test must share one
// connection to the same database.
const { clientRef } = vi.hoisted(() => ({ clientRef: { current: null as unknown } }));

vi.mock("@/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db")>()),
  get db() {
    return drizzle(clientRef.current as never);
  },
}));

// `survey-db.server` reads these for logging only; neither is on the path under
// test, and both would otherwise open their own pools.
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const describeDb = DATABASE_URL ? describe : describe.skip;

type SurveyFixture = {
  workspace: string;
  surveyInternalId: number;
  surveyPublicId: string;
  pageLabel: string;
  questionLabel: string;
  questionInternalId: number;
  /** The internal id of the same page label in the OTHER workspace. */
  otherTenantQuestionInternalId: number;
};

describeDb("saveSurveyAnswer scopes the question to this survey (#2126)", () => {
  let client: postgres.Sql;
  const workspaceIds: string[] = [];
  let saveSurveyAnswer: typeof import("@/lib/survey-db.server").saveSurveyAnswer;
  let submitSurveyResponse: typeof import("@/lib/survey-db.server").submitSurveyResponse;
  let surveyA: SurveyFixture;
  let surveyB: SurveyFixture;

  async function newWorkspace(name: string): Promise<string> {
    const rows = await client<{ id: string }[]>`
      insert into public.workspace (name, credits, twilio_data, feature_flags, disabled)
      values (${name}, 100, '{}'::jsonb, '{}'::jsonb, false)
      returning id::text as id
    `;
    workspaceIds.push(rows[0].id);
    return rows[0].id;
  }

  /**
   * One workspace, one survey, one page labelled `page-1`, one question labelled
   * `question-1` — the labels are deliberately identical across every fixture,
   * because that collision IS the defect.
   */
  async function newSurveyWithLabeledQuestion(
    workspace: string,
    name: string,
    questionLabel: string,
  ): Promise<Omit<SurveyFixture, "otherTenantQuestionInternalId">> {
    const survey = await client<{ id: string; survey_id: string }[]>`
      insert into public.survey (survey_id, title, workspace, is_active)
      values (gen_random_uuid(), ${name}, ${workspace}::uuid, true)
      returning id::text as id, survey_id::text as survey_id
    `;

    const page = await client<{ id: string }[]>`
      insert into public.survey_page (survey_id, page_id, title, page_order)
      values (${survey[0].id}::bigint, 'page-1', ${`${name} page`}, 1)
      returning id::text as id
    `;

    const question = await client<{ id: string }[]>`
      insert into public.survey_question
        (page_id, question_id, question_text, question_type, is_required, question_order)
      -- 'radio' is one of the four values the real check constraint allows
      -- (text / radio / checkbox / textarea).
      values (${page[0].id}::bigint, ${questionLabel}, 'Do you agree?', 'radio', false, 1)
      returning id::text as id
    `;

    return {
      workspace,
      surveyInternalId: Number(survey[0].id),
      surveyPublicId: survey[0].survey_id,
      pageLabel: "page-1",
      questionLabel,
      questionInternalId: Number(question[0].id),
    };
  }

  /** Which question internal id did the stored answer actually point at? */
  async function storedAnswerQuestionIds(): Promise<number[]> {
    const rows = await client<{ question_id: string }[]>`
      select ra.question_id::text as question_id
        from public.response_answer ra
        join public.survey_response sr on sr.id = ra.response_id
       where sr.survey_id in (${surveyA.surveyInternalId}::bigint, ${surveyB.surveyInternalId}::bigint)
       order by ra.id
    `;
    return rows.map((row) => Number(row.question_id));
  }

  async function deleteStoredAnswers(): Promise<void> {
    await client`
      delete from public.response_answer ra
       using public.survey_response sr
       where ra.response_id = sr.id
         and sr.survey_id in (${surveyA.surveyInternalId}::bigint, ${surveyB.surveyInternalId}::bigint)
    `;
    await client`
      delete from public.survey_response
       where survey_id in (${surveyA.surveyInternalId}::bigint, ${surveyB.surveyInternalId}::bigint)
    `;
  }

  beforeAll(async () => {
    client = postgres(DATABASE_URL as string, {
      max: 10,
      prepare: false,
      connect_timeout: 10,
      onnotice: () => {},
    });
    clientRef.current = client;

    // Imported after the client exists so the module-level `db` getter has
    // something to return.
    ({ saveSurveyAnswer, submitSurveyResponse } = await import("@/lib/survey-db.server"));

    const workspaceA = await newWorkspace("Integration DB Survey Scope A");
    const workspaceB = await newWorkspace("Integration DB Survey Scope B");

    const a = await newSurveyWithLabeledQuestion(workspaceA, "Scope Survey A", "question-1");
    const b = await newSurveyWithLabeledQuestion(workspaceB, "Scope Survey B", "question-1");

    surveyA = { ...a, otherTenantQuestionInternalId: b.questionInternalId };
    surveyB = { ...b, otherTenantQuestionInternalId: a.questionInternalId };
  }, 30_000);

  afterAll(async () => {
    if (!client) return;
    // survey.workspace is ON DELETE CASCADE, so this removes the pages,
    // questions, responses and answers too.
    if (workspaceIds.length > 0) {
      await client`delete from public.workspace where id = any(${workspaceIds}::uuid[])`;
    }
    await client.end({ timeout: 5 });
  });

  test("the fixture really does collide on the same labels", async () => {
    // The precondition, asserted where the failure actually lives: without this,
    // "the answer landed correctly" could mean the test never built a collision.
    expect(surveyA.questionLabel).toBe(surveyB.questionLabel);
    expect(surveyA.pageLabel).toBe(surveyB.pageLabel);
    expect(surveyA.workspace).not.toBe(surveyB.workspace);
    expect(surveyA.questionInternalId).not.toBe(surveyB.questionInternalId);
  });

  test("an answer for survey A's question-1 lands on survey A's question", async () => {
    await deleteStoredAnswers();

    const result = await saveSurveyAnswer({
      surveyInternalId: surveyA.surveyInternalId,
      questionPublicId: "question-1",
      answerValue: "Yes",
      contactId: null,
      resultId: "scope-A-1",
      pageId: "page-1",
    });

    expect(result.ok).toBe(true);
    // Precisely the tenant-boundary claim: A's own question, never B's.
    expect(await storedAnswerQuestionIds()).toEqual([surveyA.questionInternalId]);
  });

  test("the same label answered on survey B lands on survey B's question", async () => {
    await deleteStoredAnswers();

    const result = await saveSurveyAnswer({
      surveyInternalId: surveyB.surveyInternalId,
      questionPublicId: "question-1",
      answerValue: "No",
      contactId: null,
      resultId: "scope-B-1",
      pageId: "page-1",
    });

    expect(result.ok).toBe(true);
    expect(await storedAnswerQuestionIds()).toEqual([surveyB.questionInternalId]);
  });

  test("a page label from another survey is refused and writes nothing", async () => {
    await deleteStoredAnswers();

    // Survey A, but naming a page that does not belong to it. Under the old
    // lookup this wrote to whatever `question-1` came back first.
    const result = await saveSurveyAnswer({
      surveyInternalId: surveyA.surveyInternalId,
      questionPublicId: "question-1",
      answerValue: "Yes",
      contactId: null,
      resultId: "scope-A-foreign-page",
      pageId: "page-does-not-belong-to-A",
    });

    expect(result).toEqual({ ok: false, error: "Page not found", status: 404 });
    expect(await storedAnswerQuestionIds()).toEqual([]);
  });

  test("a question label absent from the named page is refused and writes nothing", async () => {
    await deleteStoredAnswers();

    const result = await saveSurveyAnswer({
      surveyInternalId: surveyA.surveyInternalId,
      questionPublicId: "question-does-not-exist",
      answerValue: "Yes",
      contactId: null,
      resultId: "scope-A-missing-question",
      pageId: "page-1",
    });

    expect(result).toEqual({ ok: false, error: "Question not found", status: 404 });
    expect(await storedAnswerQuestionIds()).toEqual([]);
  });

  /**
   * The same defect on the sibling path.
   *
   * `submitSurveyResponse` scoped the question by page only when
   * `last_page_completed` resolved, so a submission carrying answers but no
   * `last_page_completed` fell back to `question_id` alone — the identical
   * cross-survey write. A fix that scopes `saveSurveyAnswer` and leaves this
   * alone would close the front door and leave the side one open.
   *
   * Submitting WITHOUT `last_page_completed` is what distinguishes the two paths:
   * the page predicate cannot help there, so the survey-scoping join is the only
   * thing standing between the caller and another tenant's question.
   */
  test("submitSurveyResponse scopes answers to the survey even with no last_page_completed", async () => {
    await deleteStoredAnswers();

    // Survey A holds `question-1`; survey B holds the same label. The page
    // lookup must not resolve here, so only the survey scope can be correct.
    expect(surveyA.surveyInternalId).not.toBe(surveyB.surveyInternalId);

    const result = await submitSurveyResponse({
      surveyPublicId: surveyA.surveyPublicId,
      responseData: {
        result_id: "scope-submit-A",
        // Deliberately omitted: this is the branch that used to be unscoped.
        last_page_completed: null,
        answers: [{ question_id: "question-1", answer_value: "Yes" }],
      },
    });

    expect(result.ok).toBe(true);
    expect(await storedAnswerQuestionIds()).toEqual([surveyA.questionInternalId]);
  });

  test("the same label submitted on survey B lands on survey B's question", async () => {
    await deleteStoredAnswers();

    const result = await submitSurveyResponse({
      surveyPublicId: surveyB.surveyPublicId,
      responseData: {
        result_id: "scope-submit-B",
        last_page_completed: null,
        answers: [{ question_id: "question-1", answer_value: "No" }],
      },
    });

    expect(result.ok).toBe(true);
    expect(await storedAnswerQuestionIds()).toEqual([surveyB.questionInternalId]);
  });
});