import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";
import { createRespondentToken } from "@/lib/survey-respondent-token.server";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret";
});

const surveyDbMocks = vi.hoisted(() => ({
  completeSurveyResponse: vi.fn(async () => ({
    ok: true as const,
    result_id: "R1",
  })),
  getActiveSurveyByPublicId: vi.fn(async () => ({
    id: 1,
    is_active: true,
    workspace: "ws-1",
  })),
  loadContactById: vi.fn(async () => ({
    id: 100,
    workspace: "ws-1",
  })),
}));

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/survey-db.server", () => ({
  completeSurveyResponse: (...args: unknown[]) => surveyDbMocks.completeSurveyResponse(...args),
  getActiveSurveyByPublicId: (...args: unknown[]) => surveyDbMocks.getActiveSurveyByPublicId(...args),
  loadContactById: (...args: unknown[]) => surveyDbMocks.loadContactById(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeReq(body: Record<string, string | Blob>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, v);
  return new Request("http://x", { method: "POST", body: fd });
}

describe("app/routes/api+/survey-complete/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    resetRateLimitsForTests();
    mocks.logger.error.mockReset();
    surveyDbMocks.completeSurveyResponse.mockReset();
    surveyDbMocks.completeSurveyResponse.mockResolvedValue({
      ok: true,
      result_id: "R1",
    });
    surveyDbMocks.getActiveSurveyByPublicId.mockReset();
    surveyDbMocks.getActiveSurveyByPublicId.mockResolvedValue({
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
    const mod = await import("../app/routes/api+/survey-complete");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "GET" }) } as any));
    expect(res.status).toBe(405);
  });

  test("validates required fields", async () => {
    const mod = await import("../app/routes/api+/survey-complete");
    const fd = new FormData();
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any));
    expect(res.status).toBe(400);
  });

  test("rejects honeypot field", async () => {
    const mod = await import("../app/routes/api+/survey-complete");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        surveyId: "S1",
        resultId: "R1",
        completed: "true",
        website: "filled",
      }),
    } as any));
    expect(res.status).toBe(400);
  });

  test("rejects invalid respondent token", async () => {
    const mod = await import("../app/routes/api+/survey-complete");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x?respondent_token=bad-token", {
        method: "POST",
        body: new FormData(),
      }),
    } as any));
    expect(res.status).toBe(400);
  });

  test("generates a respondent token when none is provided", async () => {
    const mod = await import("../app/routes/api+/survey-complete");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        surveyId: "S1",
        completed: "true",
      }),
    } as any));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.respondent_token).toBeDefined();
    expect(json.respondent_token).toContain(".");
    expect(surveyDbMocks.completeSurveyResponse).toHaveBeenCalledWith({
      surveyInternalId: 1,
      resultId: expect.any(String),
      completed: true,
    });
  });

  test("uses provided respondent token and marks response complete", async () => {
    const mod = await import("../app/routes/api+/survey-complete");
    const { token } = await createRespondentToken(1, "ws-1");
    const fd = new FormData();
    fd.set("surveyId", "S1");
    fd.set("completed", "false");
    const res = await asRouteResponse(await mod.action({
      request: new Request(`http://x?respondent_token=${encodeURIComponent(token)}`, {
        method: "POST",
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.respondent_token).toBe(token);
    expect(surveyDbMocks.completeSurveyResponse).toHaveBeenCalledWith({
      surveyInternalId: 1,
      resultId: expect.any(String),
      completed: false,
    });
  });

  test("rate limits by IP", async () => {
    const mod = await import("../app/routes/api+/survey-complete");

    function makeBody() {
      const fd = new FormData();
      fd.set("surveyId", "S1");
      fd.set("completed", "true");
      return fd;
    }

    for (let i = 0; i < 10; i++) {
      const r = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: makeBody() }) } as any));
      expect(r.status).toBe(200);
    }

    const limited = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: makeBody() }) } as any));
    expect(limited.status).toBe(429);
  });

  test("rejects contact outside survey workspace", async () => {
    surveyDbMocks.loadContactById.mockResolvedValueOnce({ id: 100, workspace: "ws-other" });
    const mod = await import("../app/routes/api+/survey-complete");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        surveyId: "S1",
        completed: "true",
        contactId: "100",
      }),
    } as any));
    expect(res.status).toBe(400);
  });

  test("returns 404 when survey not found and 400 when inactive", async () => {
    const mod = await import("../app/routes/api+/survey-complete");

    surveyDbMocks.getActiveSurveyByPublicId.mockResolvedValueOnce(null);
    const r1 = await asRouteResponse(await mod.action({
      request: makeReq({ surveyId: "S1", resultId: "R1" }),
    } as any));
    expect(r1.status).toBe(404);

    surveyDbMocks.getActiveSurveyByPublicId.mockResolvedValueOnce({
      id: 1,
      is_active: false,
      workspace: "ws-1",
    });
    const r2 = await asRouteResponse(await mod.action({
      request: makeReq({ surveyId: "S1", resultId: "R1" }),
    } as any));
    expect(r2.status).toBe(400);
  });

  test("returns 500 when completion fails and logs", async () => {
    surveyDbMocks.completeSurveyResponse.mockResolvedValueOnce({
      ok: false,
      error: "Failed to complete survey",
      status: 500,
    });
    const mod = await import("../app/routes/api+/survey-complete");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ surveyId: "S1", resultId: "R1" }),
    } as any));
    expect(res.status).toBe(500);
  });
});
