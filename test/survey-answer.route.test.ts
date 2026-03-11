import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createSupabaseServerClient: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/supabase.server", () => ({
  createSupabaseServerClient: (...args: any[]) => mocks.createSupabaseServerClient(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabase(opts: {
  surveyRow?: any;
  surveyError?: any;
  insertSurveyResponseData?: any;
  insertSurveyResponseError?: any;
  existingSurveyResponse?: any;
  fetchExistingError?: any;
  updateSurveyResponseError?: any;
  questionRow?: any;
  questionError?: any;
  answerInsertError?: any;
  answerUpdateError?: any;
}) {
  const has = (key: keyof typeof opts) =>
    Object.prototype.hasOwnProperty.call(opts, key);

  return {
    from: vi.fn((table: string) => {
      if (table === "survey") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: has("surveyRow") ? opts.surveyRow : { id: 1, is_active: true },
                error: opts.surveyError ?? null,
              }),
            }),
          }),
        };
      }
      if (table === "survey_response") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: has("insertSurveyResponseData")
                  ? opts.insertSurveyResponseData
                  : opts.insertSurveyResponseError
                    ? null
                    : { id: 10 },
                error: opts.insertSurveyResponseError ?? null,
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: has("existingSurveyResponse")
                  ? opts.existingSurveyResponse
                  : { id: 10 },
                error: opts.fetchExistingError ?? null,
              }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: opts.updateSurveyResponseError ?? null }),
          }),
        };
      }
      if (table === "survey_question") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: has("questionRow") ? opts.questionRow : { id: 5 },
                error: opts.questionError ?? null,
              }),
            }),
          }),
        };
      }
      if (table === "response_answer") {
        return {
          insert: async () => ({ error: opts.answerInsertError ?? null }),
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: opts.answerUpdateError ?? null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("app/routes/api.survey-answer.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createSupabaseServerClient.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns 405 for non-POST", async () => {
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: makeSupabase({}) });
    const mod = await import("../app/routes/api.survey-answer");
    const res = await mod.action({ request: new Request("http://x", { method: "GET" }) } as any);
    expect(res.status).toBe(405);
  });

  test("validates required fields and invalid survey/contact IDs", async () => {
    mocks.createSupabaseServerClient.mockReturnValue({ supabaseClient: makeSupabase({}) });
    const mod = await import("../app/routes/api.survey-answer");

    const fd0 = new FormData();
    const r0 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd0 }) } as any);
    expect(r0.status).toBe(400);

    const fd1 = new FormData();
    fd1.set("surveyId", "NaN");
    fd1.set("questionId", "Q1");
    fd1.set("resultId", "R1");
    fd1.set("pageId", "p1");
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any);
    expect(r1.status).toBe(400);

    const fd2 = new FormData();
    fd2.set("surveyId", "1");
    fd2.set("questionId", "Q1");
    fd2.set("resultId", "R1");
    fd2.set("pageId", "p1");
    fd2.set("contactId", "nope");
    const r2 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any);
    expect(r2.status).toBe(400);
  });

  test("returns 404 when survey missing or inactive", async () => {
    const mod = await import("../app/routes/api.survey-answer");

    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ surveyRow: null, surveyError: null }),
    });
    const fd1 = new FormData();
    fd1.set("surveyId", "1");
    fd1.set("questionId", "Q1");
    fd1.set("resultId", "R1");
    fd1.set("pageId", "p1");
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any);
    expect(r1.status).toBe(404);

    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ surveyRow: { id: 1, is_active: false } }),
    });
    const fd2 = new FormData();
    fd2.set("surveyId", "1");
    fd2.set("questionId", "Q1");
    fd2.set("resultId", "R1");
    fd2.set("pageId", "p1");
    const r2 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any);
    expect(r2.status).toBe(400);
  });

  test("unique-violation on survey_response insert fetches existing; update progress error only logs", async () => {
    const mod = await import("../app/routes/api.survey-answer");
    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({
        insertSurveyResponseError: { code: "23505" },
        existingSurveyResponse: { id: 10 },
        updateSurveyResponseError: { message: "upd" },
      }),
    });

    const fd = new FormData();
    fd.set("surveyId", "1");
    fd.set("questionId", "Q1");
    fd.set("resultId", "R1");
    fd.set("pageId", "p1");
    const res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.status).toBe(200);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error updating survey response:", { message: "upd" });
  });

  test("non-unique insert error returns 500; fetch-existing error returns 500", async () => {
    const mod = await import("../app/routes/api.survey-answer");

    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ insertSurveyResponseError: { code: "X" } }),
    });
    const fd1 = new FormData();
    fd1.set("surveyId", "1");
    fd1.set("questionId", "Q1");
    fd1.set("resultId", "R1");
    fd1.set("pageId", "p1");
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any);
    expect(r1.status).toBe(500);

    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ insertSurveyResponseError: { code: "23505" }, existingSurveyResponse: null, fetchExistingError: { message: "no" } }),
    });
    const fd2 = new FormData();
    fd2.set("surveyId", "1");
    fd2.set("questionId", "Q1");
    fd2.set("resultId", "R1");
    fd2.set("pageId", "p1");
    const r2 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any);
    expect(r2.status).toBe(500);
  });

  test("returns 500 when survey_response insert returns null data without error", async () => {
    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ insertSurveyResponseData: null, insertSurveyResponseError: null }),
    });
    const mod = await import("../app/routes/api.survey-answer");
    const fd = new FormData();
    fd.set("surveyId", "1");
    fd.set("questionId", "Q1");
    fd.set("resultId", "R1");
    fd.set("pageId", "p1");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to create survey response" });
  });

  test("returns 404 when question not found; answer insert unique violation updates; update error returns 500", async () => {
    const mod = await import("../app/routes/api.survey-answer");

    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ questionRow: null, questionError: null }),
    });
    const fd1 = new FormData();
    fd1.set("surveyId", "1");
    fd1.set("questionId", "Q1");
    fd1.set("resultId", "R1");
    fd1.set("pageId", "p1");
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any);
    expect(r1.status).toBe(404);

    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ answerInsertError: { code: "23505" } }),
    });
    const fd2 = new FormData();
    fd2.set("surveyId", "1");
    fd2.set("questionId", "Q1");
    fd2.set("resultId", "R1");
    fd2.set("pageId", "p1");
    const r2 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any);
    expect(r2.status).toBe(200);

    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ answerInsertError: { code: "23505" }, answerUpdateError: { message: "bad" } }),
    });
    const fd3 = new FormData();
    fd3.set("surveyId", "1");
    fd3.set("questionId", "Q1");
    fd3.set("resultId", "R1");
    fd3.set("pageId", "p1");
    const r3 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd3 }) } as any);
    expect(r3.status).toBe(500);
  });

  test("non-unique answer insert error returns 500; catch returns 500 internal", async () => {
    const mod = await import("../app/routes/api.survey-answer");
    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ answerInsertError: { code: "X" } }),
    });
    const fd1 = new FormData();
    fd1.set("surveyId", "1");
    fd1.set("questionId", "Q1");
    fd1.set("resultId", "R1");
    fd1.set("pageId", "p1");
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any);
    expect(r1.status).toBe(500);

    // force formData() throw deterministically
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: makeSupabase({}) });
    const r2 = await mod.action({
      request: {
        method: "POST",
        formData: async () => {
          throw new Error("boom");
        },
      } as any,
    } as any);
    expect(r2.status).toBe(500);
  });
});

