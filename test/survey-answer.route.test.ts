import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const surveyDbMocks = vi.hoisted(() => ({
  saveSurveyAnswer: vi.fn(async () => ({
    ok: true as const,
    response_id: 10,
    result_id: "R1",
  })),
}));

vi.mock("@/lib/survey-db.server", () => ({
  saveSurveyAnswer: (...args: unknown[]) => surveyDbMocks.saveSurveyAnswer(...args),
}));

describe("app/routes/api+/survey-answer/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    surveyDbMocks.saveSurveyAnswer.mockReset();
    surveyDbMocks.saveSurveyAnswer.mockResolvedValue({
      ok: true,
      response_id: 10,
      result_id: "R1",
    });
  });

  test("returns 405 for non-POST", async () => {
    const mod = await import("../app/routes/api+/survey-answer");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "GET" }) } as any));
    expect(res.status).toBe(405);
  });

  test("validates required fields and invalid survey/contact IDs", async () => {
    const mod = await import("../app/routes/api+/survey-answer");

    const fd0 = new FormData();
    const r0 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd0 }) } as any));
    expect(r0.status).toBe(400);

    const fd1 = new FormData();
    fd1.set("surveyId", "NaN");
    fd1.set("questionId", "Q1");
    fd1.set("resultId", "R1");
    fd1.set("pageId", "p1");
    const r1 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any));
    expect(r1.status).toBe(400);

    const fd2 = new FormData();
    fd2.set("surveyId", "1");
    fd2.set("questionId", "Q1");
    fd2.set("resultId", "R1");
    fd2.set("pageId", "p1");
    fd2.set("contactId", "nope");
    const r2 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any));
    expect(r2.status).toBe(400);
  });

  test("returns route errors from saveSurveyAnswer", async () => {
    const mod = await import("../app/routes/api+/survey-answer");

    surveyDbMocks.saveSurveyAnswer.mockResolvedValueOnce({
      ok: false,
      error: "Survey not found",
      status: 404,
    });
    const fd1 = new FormData();
    fd1.set("surveyId", "1");
    fd1.set("questionId", "Q1");
    fd1.set("resultId", "R1");
    fd1.set("pageId", "p1");
    const r1 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any));
    expect(r1.status).toBe(404);

    surveyDbMocks.saveSurveyAnswer.mockResolvedValueOnce({
      ok: false,
      error: "Failed to save answer",
      status: 500,
    });
    const fd2 = new FormData();
    fd2.set("surveyId", "1");
    fd2.set("questionId", "Q1");
    fd2.set("resultId", "R1");
    fd2.set("pageId", "p1");
    const r2 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any));
    expect(r2.status).toBe(500);
  });

  test("returns success payload from saveSurveyAnswer", async () => {
    const mod = await import("../app/routes/api+/survey-answer");
    const fd = new FormData();
    fd.set("surveyId", "1");
    fd.set("questionId", "Q1");
    fd.set("answerValue", "yes");
    fd.set("resultId", "R1");
    fd.set("pageId", "p1");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      response_id: 10,
      result_id: "R1",
    });
    expect(surveyDbMocks.saveSurveyAnswer).toHaveBeenCalledWith({
      surveyInternalId: 1,
      questionPublicId: "Q1",
      answerValue: "yes",
      contactId: null,
      resultId: "R1",
      pageId: "p1",
    });
  });
});
