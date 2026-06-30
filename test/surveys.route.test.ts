import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession, setDualAuthSession, queueJsonAuthSession, setJsonAuthSession, queueSudoAuth, setSudoAuth } from "./helpers/route-auth-mock";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const surveyDbMocks = vi.hoisted(() => ({
  findUserById: vi.fn(async () => ({ id: "u1" })),
  createSurveyWithStructure: vi.fn(async () => ({ id: 1, survey_id: "S1", title: "T" })),
  getSurveyWorkspaceByPublicId: vi.fn(async () => "w1"),
  updateSurveyMetadata: vi.fn(async () => ({ id: 1, title: "X" })),
  deleteSurveyByPublicId: vi.fn(async () => undefined),
}));

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
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

vi.mock("@/lib/auth.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  getUserRole: (...args: any[]) => mocks.getUserRole(...args),
}));
vi.mock("@/lib/errors.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/errors.server")>();
  return {
    ...actual,
    handleDatabaseError: (...args: any[]) => mocks.handleDatabaseError(...args),
    createErrorResponse: (...args: any[]) => mocks.createErrorResponse(...args),
  };
});
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/survey-db.server", () => ({
  findUserById: (...args: unknown[]) => surveyDbMocks.findUserById(...args),
  createSurveyWithStructure: (...args: unknown[]) => surveyDbMocks.createSurveyWithStructure(...args),
  getSurveyWorkspaceByPublicId: (...args: unknown[]) => surveyDbMocks.getSurveyWorkspaceByPublicId(...args),
  updateSurveyMetadata: (...args: unknown[]) => surveyDbMocks.updateSurveyMetadata(...args),
  deleteSurveyByPublicId: (...args: unknown[]) => surveyDbMocks.deleteSurveyByPublicId(...args),
}));

function sbSingle(result: { data: any; error: any }) {
  return { single: vi.fn(async () => result) };
}

function makeDbClient(handlers: {
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

describe("app/routes/api+/surveys/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getUserRole.mockReset();
    mocks.handleDatabaseError.mockClear();
    mocks.createErrorResponse.mockClear();
    mocks.logger.error.mockReset();
    surveyDbMocks.findUserById.mockReset();
    surveyDbMocks.createSurveyWithStructure.mockReset();
    surveyDbMocks.getSurveyWorkspaceByPublicId.mockReset();
    surveyDbMocks.updateSurveyMetadata.mockReset();
    surveyDbMocks.deleteSurveyByPublicId.mockReset();
    surveyDbMocks.findUserById.mockResolvedValue({ id: "u1" });
    surveyDbMocks.createSurveyWithStructure.mockResolvedValue({ id: 1, survey_id: "S1", title: "T" });
    surveyDbMocks.getSurveyWorkspaceByPublicId.mockResolvedValue("w1");
    surveyDbMocks.updateSurveyMetadata.mockResolvedValue({ id: 1, title: "X" });
    surveyDbMocks.deleteSurveyByPublicId.mockResolvedValue(undefined);
  });

  test("method not allowed returns createErrorResponse", async () => {
    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    const mod = await import("../app/routes/api+/surveys");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "PUT" }) } as any));
    expect(res.status).toBe(500);
    expect(mocks.createErrorResponse).toHaveBeenCalled();
  });

  test("POST validates body and unauthorized role", async () => {
    setDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce(null);
    const mod = await import("../app/routes/api+/surveys");

    const r0 = await asRouteResponse(await mod.action({ request: reqForm("POST", {}) } as any));
    expect(r0.status).toBe(400);

    mocks.getUserRole.mockResolvedValueOnce({ role: "viewer" });
    const r1 = await asRouteResponse(await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({ title: "T", pages: [] }),
      }),
    } as any));
    expect(r1.status).toBe(403);
  });

  test("POST invalid surveyData JSON and missing workspaceId return 400", async () => {
    setDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    const mod = await import("../app/routes/api+/surveys");

    const r0 = await asRouteResponse(await mod.action({
      request: reqForm("POST", { workspaceId: "w1", surveyData: "not-json" }),
    } as any));
    expect(r0.status).toBe(400);

    const r1 = await asRouteResponse(await mod.action({
      request: reqForm("POST", { surveyData: JSON.stringify({ title: "T" }) }),
    } as any));
    expect(r1.status).toBe(400);
  });

  test("POST returns 404 when db user missing", async () => {
    surveyDbMocks.findUserById.mockResolvedValueOnce(null);
    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    const mod = await import("../app/routes/api+/surveys");
    const res = await asRouteResponse(await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({ title: "T", pages: [] }),
      }),
    } as any));
    expect(res.status).toBe(404);
  });

  test("POST handles insert error via handleDatabaseError", async () => {
    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce({ role: "owner" });
    surveyDbMocks.createSurveyWithStructure.mockRejectedValueOnce({ message: "bad" });

    const mod = await import("../app/routes/api+/surveys");
    const res = await asRouteResponse(await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({ title: "T", pages: [] }),
      }),
    } as any));
    expect(res.status).toBe(500);
    expect(mocks.handleDatabaseError).toHaveBeenCalled();
    expect(mocks.createErrorResponse).toHaveBeenCalled();
  });

  test("POST creates survey with nested structure", async () => {
    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });

    const mod = await import("../app/routes/api+/surveys");
    const res = await asRouteResponse(await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({
          survey_id: "S1",
          title: "T",
          is_active: true,
          pages: [
            { page_id: "p0", title: "P0", page_order: 0, questions: [] },
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
    } as any));
    expect(res.status).toBe(200);
    expect(surveyDbMocks.createSurveyWithStructure).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1" }),
    );
  });

  test("POST creates survey happy path", async () => {
    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce({ role: "member" });

    const mod = await import("../app/routes/api+/surveys");
    const res = await asRouteResponse(await mod.action({
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
    } as any));
    expect(res.status).toBe(200);
  });

  test("POST with no pages skips page/question creation", async () => {
    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce({ role: "owner" });
    const mod = await import("../app/routes/api+/surveys");
    const res = await asRouteResponse(await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({ survey_id: "S1", title: "T" }),
      }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("POST page with no questions still creates survey", async () => {
    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });
    const mod = await import("../app/routes/api+/surveys");
    const res = await asRouteResponse(await mod.action({
      request: reqForm("POST", {
        workspaceId: "w1",
        surveyData: JSON.stringify({
          survey_id: "S1",
          title: "T",
          pages: [{ page_id: "p1", title: "P1", page_order: 0, questions: [] }],
        }),
      }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("POST question with no options still creates survey", async () => {
    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    mocks.getUserRole.mockResolvedValueOnce({ role: "member" });
    const mod = await import("../app/routes/api+/surveys");
    const res = await asRouteResponse(await mod.action({
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
    } as any));
    expect(res.status).toBe(200);
  });

  test("PATCH validates, 404s missing survey, unauthorized role, update error, and success", async () => {
    const mod = await import("../app/routes/api+/surveys");

    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    let r0 = await asRouteResponse(await mod.action({ request: reqForm("PATCH", {}) } as any));
    expect(r0.status).toBe(400);

    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    r0 = await asRouteResponse(await mod.action({
      request: reqForm("PATCH", { surveyId: "S1", surveyData: "not-json" }),
    } as any));
    expect(r0.status).toBe(400);

    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    r0 = await asRouteResponse(await mod.action({
      request: reqForm("PATCH", { surveyData: JSON.stringify({ title: "X" }) }),
    } as any));
    expect(r0.status).toBe(400);

    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    surveyDbMocks.getSurveyWorkspaceByPublicId.mockResolvedValueOnce(null);
    r0 = await asRouteResponse(await mod.action({
      request: reqForm("PATCH", { surveyId: "S1", surveyData: JSON.stringify({ title: "X", is_active: true }) }),
    } as any));
    expect(r0.status).toBe(404);
    mocks.getUserRole.mockReset();

    queueDualAuthSession({
      null: makeDbClient({}),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "viewer" });
    const r1 = await asRouteResponse(await mod.action({
      request: reqForm("PATCH", { surveyId: "S1", surveyData: JSON.stringify({ title: "X" }) }),
    } as any));
    expect(r1.status).toBe(403);

    queueDualAuthSession({
      null: makeDbClient({}),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });
    surveyDbMocks.updateSurveyMetadata.mockResolvedValueOnce(null);
    const r2 = await asRouteResponse(await mod.action({
      request: reqForm("PATCH", { surveyId: "S1", surveyData: JSON.stringify({ title: "X" }) }),
    } as any));
    expect(r2.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error updating survey: survey not found after update",
    );

    queueDualAuthSession({
      null: makeDbClient({}),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "owner" });
    surveyDbMocks.updateSurveyMetadata.mockResolvedValueOnce({ id: 1, title: "X" });
    const r3 = await asRouteResponse(await mod.action({
      request: reqForm("PATCH", { surveyId: "S1", surveyData: JSON.stringify({ title: "X" }) }),
    } as any));
    expect(r3.status).toBe(200);
  });

  test("PATCH catch logs and returns 500 when formData throws", async () => {
    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    const mod = await import("../app/routes/api+/surveys");
    const res = await asRouteResponse(await mod.action({
      request: {
        method: "PATCH",
        formData: async () => {
          throw new Error("boom");
        },
      } as any,
    } as any));
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in handleUpdateSurvey:", expect.anything());
  });

  test("DELETE validates, unauthorized role, delete error, and success", async () => {
    const mod = await import("../app/routes/api+/surveys");

    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    const r0 = await asRouteResponse(await mod.action({ request: reqForm("DELETE", {}) } as any));
    expect(r0.status).toBe(400);

    queueDualAuthSession({
      null: makeDbClient({ surveyLookup: { data: { workspace: "w1" }, error: null } }),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "viewer" });
    const r1 = await asRouteResponse(await mod.action({ request: reqForm("DELETE", { surveyId: "S1" }) } as any));
    expect(r1.status).toBe(403);

    queueDualAuthSession({
      null: makeDbClient({}),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });
    surveyDbMocks.deleteSurveyByPublicId.mockRejectedValueOnce(new Error("no"));
    const r2 = await asRouteResponse(await mod.action({ request: reqForm("DELETE", { surveyId: "S1" }) } as any));
    expect(r2.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in handleDeleteSurvey:", expect.anything());

    queueDualAuthSession({
      null: makeDbClient({}),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "owner" });
    const r3 = await asRouteResponse(await mod.action({ request: reqForm("DELETE", { surveyId: "S1" }) } as any));
    expect(r3.status).toBe(200);
  });

  test("DELETE survey not found 404; catch logs and returns 500", async () => {
    const mod = await import("../app/routes/api+/surveys");

    queueDualAuthSession({
      null: makeDbClient({}),
      user: { id: "u1" },
    });
    surveyDbMocks.getSurveyWorkspaceByPublicId.mockResolvedValueOnce(null);
    const r0 = await asRouteResponse(await mod.action({ request: reqForm("DELETE", { surveyId: "S1" }) } as any));
    expect(r0.status).toBe(404);

    queueDualAuthSession({ null: makeDbClient({}), user: { id: "u1" } });
    const r1 = await asRouteResponse(await mod.action({
      request: {
        method: "DELETE",
        formData: async () => {
          throw new Error("boom");
        },
      } as any,
    } as any));
    expect(r1.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in handleDeleteSurvey:", expect.anything());
  });
});

