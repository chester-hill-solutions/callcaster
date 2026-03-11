import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function sbSingle(result: { data: any; error: any }) {
  return { single: vi.fn(async () => result) };
}

function makeSupabase(handlers: {
  survey?: { data: any; error: any };
  insertResponse?: { data: any; error: any };
  existingResponse?: { data: any; error: any };
  updateExisting?: { error: any };
  page?: { data: any; error?: any };
  question?: { data: any; error: any };
  answerInsert?: { error: any };
  answerUpdate?: { error: any };
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "survey") {
        return {
          select: () => ({
            eq: () => sbSingle(handlers.survey ?? { data: { id: 1, is_active: true }, error: null }),
          }),
        };
      }
      if (table === "survey_response") {
        return {
          insert: () => ({
            select: () => ({
              single: vi.fn(async () => handlers.insertResponse ?? { data: { id: 10 }, error: null }),
            }),
          }),
          select: () => ({
            eq: () => sbSingle(handlers.existingResponse ?? { data: { id: 10 }, error: null }),
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => handlers.updateExisting ?? { error: null }),
          })),
        };
      }
      if (table === "survey_page") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => sbSingle(handlers.page ?? { data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "survey_question") {
        const single = vi.fn(async () => handlers.question ?? { data: { id: 5 }, error: null });
        const q: any = {
          select: () => q,
          eq: vi.fn(() => q),
          single,
        };
        return q;
      }
      if (table === "response_answer") {
        return {
          insert: vi.fn(async () => handlers.answerInsert ?? { error: null }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => handlers.answerUpdate ?? { error: null }),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function makeReq(form: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) fd.set(k, v);
  return new Request("http://x", { method: "POST", body: fd });
}

describe("app/routes/api.survey-responses.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns 405 for non-POST", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}) });
    const mod = await import("../app/routes/api.survey-responses");
    const res = await mod.action({ request: new Request("http://x", { method: "GET" }) } as any);
    expect(res.status).toBe(405);
  });

  test("validates required fields and bad JSON", async () => {
    mocks.verifyAuth.mockResolvedValue({ supabaseClient: makeSupabase({}) });
    const mod = await import("../app/routes/api.survey-responses");

    const r0 = await mod.action({ request: makeReq({ surveyId: "S1" }) } as any);
    expect(r0.status).toBe(400);

    const r1 = await mod.action({
      request: makeReq({ surveyId: "", responseData: JSON.stringify({}) }),
    } as any);
    expect(r1.status).toBe(400);

    const r2 = await mod.action({
      request: makeReq({ surveyId: "S1", responseData: "not-json" }),
    } as any);
    expect(r2.status).toBe(400);
  });

  test("returns 404 when survey missing and 400 when inactive", async () => {
    const mod = await import("../app/routes/api.survey-responses");

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ survey: { data: null, error: null } }),
    });
    const r1 = await mod.action({
      request: makeReq({ surveyId: "S1", responseData: JSON.stringify({ result_id: "R1" }) }),
    } as any);
    expect(r1.status).toBe(404);

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ survey: { data: { id: 1, is_active: false }, error: null } }),
    });
    const r2 = await mod.action({
      request: makeReq({ surveyId: "S1", responseData: JSON.stringify({ result_id: "R1" }) }),
    } as any);
    expect(r2.status).toBe(400);
  });

  test("non-unique insert error 500; unique violation fetch existing error 500", async () => {
    const mod = await import("../app/routes/api.survey-responses");

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        insertResponse: { data: null, error: { code: "X", message: "bad" } },
      }),
    });
    const r1 = await mod.action({
      request: makeReq({ surveyId: "S1", responseData: JSON.stringify({ result_id: "R1" }) }),
    } as any);
    expect(r1.status).toBe(500);

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        insertResponse: { data: null, error: { code: "23505" } },
        existingResponse: { data: null, error: { message: "no" } },
      }),
    });
    const r2 = await mod.action({
      request: makeReq({ surveyId: "S1", responseData: JSON.stringify({ result_id: "R1" }) }),
    } as any);
    expect(r2.status).toBe(500);
  });

  test("unique violation fetches existing and updates progress fields", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        insertResponse: { data: null, error: { code: "23505" } },
        existingResponse: { data: { id: 11 }, error: null },
      }),
    });
    const mod = await import("../app/routes/api.survey-responses");
    const res = await mod.action({
      request: makeReq({
        surveyId: "S1",
        responseData: JSON.stringify({
          result_id: "R1",
          completed: true,
          last_page_completed: "p1",
          answers: [],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, response_id: 11, result_id: "R1" });
  });

  test("unique violation update sets null completed_at when completed=false", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        insertResponse: { data: null, error: { code: "23505" } },
        existingResponse: { data: { id: 12 }, error: null },
      }),
    });
    const mod = await import("../app/routes/api.survey-responses");
    const res = await mod.action({
      request: makeReq({
        surveyId: "S1",
        responseData: JSON.stringify({
          result_id: "R1b",
          completed: false,
          answers: [],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("last_page_completed set but page not found keeps pageId null and still inserts answer", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        page: { data: null, error: null },
        question: { data: { id: 5 }, error: null },
        answerInsert: { error: null },
      }),
    });
    const mod = await import("../app/routes/api.survey-responses");
    const res = await mod.action({
      request: makeReq({
        surveyId: "S1",
        responseData: JSON.stringify({
          result_id: "R2b",
          last_page_completed: "p-missing",
          answers: [{ question_id: "Q1", answer_value: "x" }],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("creates answers; pageId filter branch; question missing continues; answer insert unique updates; array answer_value stringifies", async () => {
    const supabase: any = makeSupabase({
      page: { data: { id: 99 }, error: null },
    });
    let qCall = 0;
    supabase.from = vi.fn((table: string) => {
      if (table === "survey") return makeSupabase({}).from("survey");
      if (table === "survey_response") return makeSupabase({}).from("survey_response");
      if (table === "survey_page") return makeSupabase({ page: { data: { id: 99 }, error: null } }).from("survey_page");
      if (table === "survey_question") {
        const single = vi.fn(async () => {
          return qCall++ === 0
            ? { data: null, error: { message: "q" } }
            : { data: { id: 5 }, error: null };
        });
        const q: any = {
          select: () => q,
          eq: vi.fn(() => q),
          single,
        };
        return q;
      }
      if (table === "response_answer") {
        return {
          insert: vi.fn(async () => ({ error: { code: "23505" } })), // unique -> update
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: supabase });
    const mod = await import("../app/routes/api.survey-responses");
    const res = await mod.action({
      request: makeReq({
        surveyId: "S1",
        responseData: JSON.stringify({
          result_id: "R2",
          last_page_completed: "p1",
          answers: [
            { question_id: "Q1", answer_value: "x" }, // question missing => continue
            { question_id: "Q2", answer_value: ["a", "b"] }, // stringify + update-on-duplicate
          ],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("answer insert success with non-array value; no pageId branch", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        question: { data: { id: 5 }, error: null },
        answerInsert: { error: null },
      }),
    });
    const mod = await import("../app/routes/api.survey-responses");
    const res = await mod.action({
      request: makeReq({
        surveyId: "S1",
        responseData: JSON.stringify({
          result_id: "R3",
          answers: [{ question_id: "Q1", answer_value: "x" }],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("answer insert non-unique error logs and continues", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        question: { data: { id: 5 }, error: null },
        answerInsert: { error: { code: "X" } },
      }),
    });
    const mod = await import("../app/routes/api.survey-responses");
    const res = await mod.action({
      request: makeReq({
        surveyId: "S1",
        responseData: JSON.stringify({
          result_id: "R4",
          answers: [{ question_id: "Q1", answer_value: ["a"] }],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.logger.error).toHaveBeenCalledWith("Failed to insert response_answer:", expect.anything());
  });

  test("answer insert error non-object logs and continues", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        question: { data: { id: 5 }, error: null },
        answerInsert: { error: "boom" },
      }),
    });
    const mod = await import("../app/routes/api.survey-responses");
    const res = await mod.action({
      request: makeReq({
        surveyId: "S1",
        responseData: JSON.stringify({
          result_id: "R5",
          answers: [{ question_id: "Q1", answer_value: "x" }],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.logger.error).toHaveBeenCalledWith("Failed to insert response_answer:", expect.anything());
  });

  test("returns 500 on unexpected error (formData throws)", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}) });
    const mod = await import("../app/routes/api.survey-responses");
    const res = await mod.action({
      request: {
        method: "POST",
        formData: async () => {
          throw new Error("boom");
        },
      } as any,
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Internal server error" });
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in handleSubmitResponse:", expect.anything());
  });
});

