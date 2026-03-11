import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    getUserRole: vi.fn(),
    handleDatabaseError: vi.fn(() => {
      throw new Error("db");
    }),
    createErrorResponse: vi.fn((err: any) => {
      const msg = err?.message ?? "error";
      return new Response(JSON.stringify({ error: msg }), {
        status: err?.status ?? 500,
        headers: { "Content-Type": "application/json" },
      });
    }),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  getUserRole: (...args: any[]) => mocks.getUserRole(...args),
}));
vi.mock("@/lib/errors.server", () => ({
  handleDatabaseError: (...args: any[]) => mocks.handleDatabaseError(...args),
  createErrorResponse: (...args: any[]) => mocks.createErrorResponse(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function sbSingle(result: { data: any; error: any }) {
  return { single: vi.fn(async () => result) };
}

function makeSupabase(handlers: {
  user?: { data: any; error: any };
  surveyInsert?: { data: any; error: any };
  pageInsert?: { data: any; error: any };
  questionInsert?: { data: any; error: any };
  optionInsert?: { error: any };
  surveyLookup?: { data: any; error: any };
  surveyUpdate?: { data: any; error: any };
  surveyDelete?: { error: any };
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "user") {
        return {
          select: () => ({
            eq: () => sbSingle(handlers.user ?? { data: { id: "u1" }, error: null }),
          }),
        };
      }
      if (table === "survey") {
        return {
          insert: () => ({
            select: () => sbSingle(handlers.surveyInsert ?? { data: { id: 1 }, error: null }),
          }),
          select: () => ({
            eq: () => sbSingle(handlers.surveyLookup ?? { data: { workspace: "w1" }, error: null }),
          }),
          update: () => ({
            eq: () => ({
              select: () => sbSingle(handlers.surveyUpdate ?? { data: { id: 1 }, error: null }),
            }),
          }),
          delete: () => ({
            eq: vi.fn(async () => handlers.surveyDelete ?? { error: null }),
          }),
        };
      }
      if (table === "survey_page") {
        return {
          insert: () => ({
            select: () => sbSingle(handlers.pageInsert ?? { data: { id: 2 }, error: null }),
          }),
        };
      }
      if (table === "survey_question") {
        return {
          insert: () => ({
            select: () => sbSingle(handlers.questionInsert ?? { data: { id: 3 }, error: null }),
          }),
        };
      }
      if (table === "question_option") {
        return {
          insert: vi.fn(async () => handlers.optionInsert ?? { error: null }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function reqForm(method: string, fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://x", { method, body: fd });
}

describe("app/routes/api.surveys.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.getUserRole.mockReset();
    mocks.handleDatabaseError.mockClear();
    mocks.createErrorResponse.mockClear();
    mocks.logger.error.mockReset();
  });

  test("method not allowed returns createErrorResponse", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    const mod = await import("../app/routes/api.surveys");
    const res = await mod.action({ request: new Request("http://x", { method: "PUT" }) } as any);
    expect(res.status).toBe(500);
    expect(mocks.createErrorResponse).toHaveBeenCalled();
  });

  test("POST validates body and unauthorized role", async () => {
    mocks.verifyAuth.mockResolvedValue({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce(null);
    const mod = await import("../app/routes/api.surveys");

    const r0 = await mod.action({ request: reqForm("POST", {}) } as any);
    expect(r0.status).toBe(400);

    mocks.getUserRole.mockResolvedValueOnce({ role: "viewer" });
    const r1 = await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({ title: "T", pages: [] }),
      }),
    } as any);
    expect(r1.status).toBe(403);
  });

  test("POST invalid surveyData JSON and missing workspaceId return 400", async () => {
    mocks.verifyAuth.mockResolvedValue({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    const mod = await import("../app/routes/api.surveys");

    const r0 = await mod.action({
      request: reqForm("POST", { workspaceId: "w1", surveyData: "not-json" }),
    } as any);
    expect(r0.status).toBe(400);

    const r1 = await mod.action({
      request: reqForm("POST", { surveyData: JSON.stringify({ title: "T" }) }),
    } as any);
    expect(r1.status).toBe(400);
  });

  test("POST returns 404 when db user missing", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ user: { data: null, error: null } }),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api.surveys");
    const res = await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({ title: "T", pages: [] }),
      }),
    } as any);
    expect(res.status).toBe(404);
  });

  test("POST handles insert error via handleDatabaseError", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ surveyInsert: { data: null, error: { message: "bad" } } }),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "owner" });

    const mod = await import("../app/routes/api.surveys");
    const res = await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({ title: "T", pages: [] }),
      }),
    } as any);
    expect(res.status).toBe(500);
    expect(mocks.handleDatabaseError).toHaveBeenCalled();
    expect(mocks.createErrorResponse).toHaveBeenCalled();
  });

  test("POST creates survey; continues on page/question errors; inserts options", async () => {
    const supabaseClient = makeSupabase({});
    // override to vary page/question insert results in one request
    let pageCall = 0;
    (supabaseClient.from as any).mockImplementation((table: string) => {
      if (table === "user") {
        return { select: () => ({ eq: () => sbSingle({ data: { id: "u1" }, error: null }) }) };
      }
      if (table === "survey") {
        return {
          insert: () => ({ select: () => sbSingle({ data: { id: 1 }, error: null }) }),
        };
      }
      if (table === "survey_page") {
        return {
          insert: () => ({
            select: () =>
              sbSingle(
                pageCall++ === 0
                  ? { data: null, error: { message: "p" } }
                  : { data: { id: 2 }, error: null }
              ),
          }),
        };
      }
      if (table === "survey_question") {
        return {
          insert: () => ({
            select: () => sbSingle({ data: null, error: { message: "q" } }),
          }),
        };
      }
      if (table === "question_option") {
        return { insert: vi.fn(async () => ({ error: null })) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });

    const mod = await import("../app/routes/api.surveys");
    const res = await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({
          survey_id: "S1",
          title: "T",
          is_active: true,
          pages: [
            { page_id: "p0", title: "P0", page_order: 0, questions: [] }, // pageError => continue
            {
              page_id: "p1",
              title: "P1",
              page_order: 1,
              questions: [
                {
                  question_id: "q1",
                  question_text: "Q",
                  question_type: "radio",
                  is_required: true,
                  question_order: 0,
                  options: [{ option_value: "A", option_label: "A", option_order: 0 }],
                },
              ],
            },
          ],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error creating page:", expect.anything());
    expect(mocks.logger.error).toHaveBeenCalledWith("Error creating question:", expect.anything());
  });

  test("POST creates page/question and inserts options (happy path)", async () => {
    const supabaseClient = makeSupabase({});
    const optionInsert = vi.fn(async () => ({ error: null }));
    (supabaseClient.from as any).mockImplementation((table: string) => {
      if (table === "user") {
        return { select: () => ({ eq: () => sbSingle({ data: { id: "u1" }, error: null }) }) };
      }
      if (table === "survey") {
        return {
          insert: () => ({ select: () => sbSingle({ data: { id: 1 }, error: null }) }),
        };
      }
      if (table === "survey_page") {
        return {
          insert: () => ({ select: () => sbSingle({ data: { id: 2 }, error: null }) }),
        };
      }
      if (table === "survey_question") {
        return {
          insert: () => ({ select: () => sbSingle({ data: { id: 3 }, error: null }) }),
        };
      }
      if (table === "question_option") {
        return { insert: optionInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce({ role: "member" });

    const mod = await import("../app/routes/api.surveys");
    const res = await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({
          survey_id: "S1",
          title: "T",
          is_active: false,
          pages: [
            {
              page_id: "p1",
              title: "P1",
              page_order: 1,
              questions: [
                {
                  question_id: "q1",
                  question_text: "Q",
                  question_type: "radio",
                  is_required: false,
                  question_order: 0,
                  options: [
                    { option_value: "A", option_label: "A", option_order: 0 },
                    { option_value: "B", option_label: "B", option_order: 1 },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
    expect(optionInsert).toHaveBeenCalledTimes(2);
  });

  test("POST with no pages skips page/question creation", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce({ role: "owner" });
    const mod = await import("../app/routes/api.surveys");
    const res = await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({ survey_id: "S1", title: "T" }),
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("POST page with no questions skips question creation", async () => {
    const supabaseClient = makeSupabase({});
    (supabaseClient.from as any).mockImplementation((table: string) => {
      if (table === "user") return { select: () => ({ eq: () => sbSingle({ data: { id: "u1" }, error: null }) }) };
      if (table === "survey") return { insert: () => ({ select: () => sbSingle({ data: { id: 1 }, error: null }) }) };
      if (table === "survey_page") return { insert: () => ({ select: () => sbSingle({ data: { id: 2 }, error: null }) }) };
      if (table === "survey_question") return { insert: () => ({ select: () => sbSingle({ data: { id: 3 }, error: null }) }) };
      if (table === "question_option") return { insert: vi.fn(async () => ({ error: null })) };
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });
    const mod = await import("../app/routes/api.surveys");
    const res = await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({
          survey_id: "S1",
          title: "T",
          pages: [{ page_id: "p1", title: "P1", page_order: 0, questions: [] }],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("POST question with no options skips option creation", async () => {
    const optionInsert = vi.fn(async () => ({ error: null }));
    const supabaseClient = makeSupabase({});
    (supabaseClient.from as any).mockImplementation((table: string) => {
      if (table === "user") return { select: () => ({ eq: () => sbSingle({ data: { id: "u1" }, error: null }) }) };
      if (table === "survey") return { insert: () => ({ select: () => sbSingle({ data: { id: 1 }, error: null }) }) };
      if (table === "survey_page") return { insert: () => ({ select: () => sbSingle({ data: { id: 2 }, error: null }) }) };
      if (table === "survey_question") return { insert: () => ({ select: () => sbSingle({ data: { id: 3 }, error: null }) }) };
      if (table === "question_option") return { insert: optionInsert };
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce({ role: "member" });
    const mod = await import("../app/routes/api.surveys");
    const res = await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({
          survey_id: "S1",
          title: "T",
          pages: [
            {
              page_id: "p1",
              title: "P1",
              page_order: 0,
              questions: [
                {
                  question_id: "q1",
                  question_text: "Q",
                  question_type: "text",
                  is_required: false,
                  question_order: 0,
                  options: [],
                },
              ],
            },
          ],
        }),
      }),
    } as any);
    expect(res.status).toBe(200);
    expect(optionInsert).not.toHaveBeenCalled();
  });

  test("PATCH validates, 404s missing survey, unauthorized role, update error, and success", async () => {
    const mod = await import("../app/routes/api.surveys");

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    let r0 = await mod.action({ request: reqForm("PATCH", {}) } as any);
    expect(r0.status).toBe(400);

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    r0 = await mod.action({
      request: reqForm("PATCH", { surveyId: "S1", surveyData: "not-json" }),
    } as any);
    expect(r0.status).toBe(400);

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    r0 = await mod.action({
      request: reqForm("PATCH", { surveyData: JSON.stringify({ title: "X" }) }),
    } as any);
    expect(r0.status).toBe(400);

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ surveyLookup: { data: null, error: null } }),
      user: { id: "u1" },
    });
    r0 = await mod.action({
      request: reqForm("PATCH", { surveyId: "S1", surveyData: JSON.stringify({ title: "X", is_active: true }) }),
    } as any);
    expect(r0.status).toBe(404);
    mocks.getUserRole.mockReset();

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ surveyLookup: { data: { workspace: "w1" }, error: null } }),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "viewer" });
    const r1 = await mod.action({
      request: reqForm("PATCH", { surveyId: "S1", surveyData: JSON.stringify({ title: "X" }) }),
    } as any);
    expect(r1.status).toBe(403);

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        surveyLookup: { data: { workspace: "w1" }, error: null },
        surveyUpdate: { data: null, error: { message: "bad" } },
      }),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });
    const r2 = await mod.action({
      request: reqForm("PATCH", { surveyId: "S1", surveyData: JSON.stringify({ title: "X" }) }),
    } as any);
    expect(r2.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error updating survey:", expect.anything());

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        surveyLookup: { data: { workspace: "w1" }, error: null },
        surveyUpdate: { data: { id: 1, title: "X" }, error: null },
      }),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "owner" });
    const r3 = await mod.action({
      request: reqForm("PATCH", { surveyId: "S1", surveyData: JSON.stringify({ title: "X" }) }),
    } as any);
    expect(r3.status).toBe(200);
  });

  test("PATCH catch logs and returns 500 when formData throws", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    const mod = await import("../app/routes/api.surveys");
    const res = await mod.action({
      request: {
        method: "PATCH",
        formData: async () => {
          throw new Error("boom");
        },
      } as any,
    } as any);
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in handleUpdateSurvey:", expect.anything());
  });

  test("DELETE validates, unauthorized role, delete error, and success", async () => {
    const mod = await import("../app/routes/api.surveys");

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    const r0 = await mod.action({ request: reqForm("DELETE", {}) } as any);
    expect(r0.status).toBe(400);

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ surveyLookup: { data: { workspace: "w1" }, error: null } }),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "viewer" });
    const r1 = await mod.action({ request: reqForm("DELETE", { surveyId: "S1" }) } as any);
    expect(r1.status).toBe(403);

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        surveyLookup: { data: { workspace: "w1" }, error: null },
        surveyDelete: { error: { message: "no" } },
      }),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });
    const r2 = await mod.action({ request: reqForm("DELETE", { surveyId: "S1" }) } as any);
    expect(r2.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error deleting survey:", expect.anything());

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        surveyLookup: { data: { workspace: "w1" }, error: null },
      }),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "owner" });
    const r3 = await mod.action({ request: reqForm("DELETE", { surveyId: "S1" }) } as any);
    expect(r3.status).toBe(200);
  });

  test("DELETE survey not found 404; catch logs and returns 500", async () => {
    const mod = await import("../app/routes/api.surveys");

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ surveyLookup: { data: null, error: null } }),
      user: { id: "u1" },
    });
    const r0 = await mod.action({ request: reqForm("DELETE", { surveyId: "S1" }) } as any);
    expect(r0.status).toBe(404);

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    const r1 = await mod.action({
      request: {
        method: "DELETE",
        formData: async () => {
          throw new Error("boom");
        },
      } as any,
    } as any);
    expect(r1.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in handleDeleteSurvey:", expect.anything());
  });
});

