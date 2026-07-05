import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";
import { createRespondentToken } from "@/lib/survey-respondent-token.server";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret";
});

const surveyDbMocks = vi.hoisted(() => ({
  saveSurveyAnswer: vi.fn(async () => ({
    ok: true as const,
    response_id: 10,
    result_id: "R1",
  })),
  getSurveyByInternalId: vi.fn(async () => ({
    id: 1,
    is_active: true,
    workspace: "ws-1",
  })),
  loadContactById: vi.fn(async () => ({
    id: 100,
    workspace: "ws-1",
  })),
}));

vi.mock("@/lib/survey-db.server", () => ({
  saveSurveyAnswer: (...args: unknown[]) => surveyDbMocks.saveSurveyAnswer(...args),
  getSurveyByInternalId: (...args: unknown[]) => surveyDbMocks.getSurveyByInternalId(...args),
  loadContactById: (...args: unknown[]) => surveyDbMocks.loadContactById(...args),
}));

function makeReq(body: Record<string, string | Blob>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, v);
  return new Request("http://x", { method: "POST", body: fd });
}

describe("app/routes/api+/survey-answer/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    resetRateLimitsForTests();
    surveyDbMocks.saveSurveyAnswer.mockReset();
    surveyDbMocks.saveSurveyAnswer.mockResolvedValue({
      ok: true,
      response_id: 10,
      result_id: "R1",
    });
    surveyDbMocks.getSurveyByInternalId.mockReset();
    surveyDbMocks.getSurveyByInternalId.mockResolvedValue({
      id: 1,
      is_active: true,
      workspace: "ws-1",
    });
    surveyDbMocks.loadContactById.mockReset();
    surveyDbMocks.loadContactById.mockResolvedValue({
      id: 100,
      workspace: "ws-1",
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

  test("rejects honeypot field", async () => {
    const mod = await import("../app/routes/api+/survey-answer");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        surveyId: "1",
        questionId: "Q1",
        resultId: "R1",
        pageId: "p1",
        website: "filled",
      }),
    } as any));
    expect(res.status).toBe(400);
  });

  test("rejects invalid respondent token", async () => {
    const mod = await import("../app/routes/api+/survey-answer");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x?respondent_token=bad-token", { method: "POST", body: new FormData() }),
    } as any));
    expect(res.status).toBe(400);
  });

  test("generates a respondent token when none is provided", async () => {
    const mod = await import("../app/routes/api+/survey-answer");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        surveyId: "1",
        questionId: "Q1",
        answerValue: "yes",
        pageId: "p1",
      }),
    } as any));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.respondent_token).toBeDefined();
    expect(json.respondent_token).toContain(".");
    expect(surveyDbMocks.saveSurveyAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        surveyInternalId: 1,
        questionPublicId: "Q1",
        answerValue: "yes",
        contactId: null,
      }),
    );
  });

  test("uses and returns respondent token when provided", async () => {
    const mod = await import("../app/routes/api+/survey-answer");
    const { token } = await createRespondentToken(1, "ws-1");
    const res = await asRouteResponse(await mod.action({
      request: new Request(`http://x?respondent_token=${encodeURIComponent(token)}`, {
        method: "POST",
        body: new FormData(),
      }),
    } as any));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.respondent_token).toBe(token);
  });

  test("rate limits by IP", async () => {
    const mod = await import("../app/routes/api+/survey-answer");
    const body = new FormData();
    body.set("surveyId", "1");
    body.set("questionId", "Q1");
    body.set("pageId", "p1");
    const base = new Request("http://x", { method: "POST", body });

    for (let i = 0; i < 10; i++) {
      const r = await asRouteResponse(await mod.action({ request: new Request(base, { method: "POST", body }) } as any));
      expect(r.status).toBe(200);
    }

    const limited = await asRouteResponse(await mod.action({ request: new Request(base, { method: "POST", body }) } as any));
    expect(limited.status).toBe(429);
  });

  test("rejects contact outside survey workspace", async () => {
    surveyDbMocks.loadContactById.mockResolvedValueOnce({ id: 100, workspace: "ws-other" });
    const mod = await import("../app/routes/api+/survey-answer");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        surveyId: "1",
        questionId: "Q1",
        pageId: "p1",
        contactId: "100",
      }),
    } as any));
    expect(res.status).toBe(400);
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
});
