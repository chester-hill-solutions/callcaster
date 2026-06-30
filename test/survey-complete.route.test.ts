import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const surveyDbMocks = vi.hoisted(() => ({
  completeSurveyResponse: vi.fn(async () => ({
    ok: true as const,
    result_id: "R1",
  })),
}));

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/survey-db.server", () => ({
  completeSurveyResponse: (...args: unknown[]) => surveyDbMocks.completeSurveyResponse(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api+/survey-complete/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
    surveyDbMocks.completeSurveyResponse.mockReset();
    surveyDbMocks.completeSurveyResponse.mockResolvedValue({
      ok: true,
      result_id: "R1",
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
    fd.set("surveyId", "S1");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any));
    expect(res.status).toBe(400);
  });

  test("returns 404 when survey not found and 400 when inactive", async () => {
    const mod = await import("../app/routes/api+/survey-complete");

    surveyDbMocks.completeSurveyResponse.mockResolvedValueOnce({
      ok: false,
      error: "Survey not found",
      status: 404,
    });
    const fd1 = new FormData();
    fd1.set("surveyId", "S1");
    fd1.set("resultId", "R1");
    const r1 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any));
    expect(r1.status).toBe(404);

    surveyDbMocks.completeSurveyResponse.mockResolvedValueOnce({
      ok: false,
      error: "Survey is not active",
      status: 400,
    });
    const fd2 = new FormData();
    fd2.set("surveyId", "S1");
    fd2.set("resultId", "R1");
    const r2 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any));
    expect(r2.status).toBe(400);
  });

  test("completes survey for completed=true and completed=false", async () => {
    const mod = await import("../app/routes/api+/survey-complete");

    const fd1 = new FormData();
    fd1.set("surveyId", "S1");
    fd1.set("resultId", "R1");
    fd1.set("completed", "true");
    const r1 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any));
    expect(r1.status).toBe(200);
    expect(surveyDbMocks.completeSurveyResponse).toHaveBeenCalledWith({
      surveyPublicId: "S1",
      resultId: "R1",
      completed: true,
    });

    const fd2 = new FormData();
    fd2.set("surveyId", "S1");
    fd2.set("resultId", "R2");
    fd2.set("completed", "false");
    const r2 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any));
    expect(r2.status).toBe(200);
  });

  test("returns 500 when completion fails and logs", async () => {
    surveyDbMocks.completeSurveyResponse.mockResolvedValueOnce({
      ok: false,
      error: "Failed to complete survey",
      status: 500,
    });
    const mod = await import("../app/routes/api+/survey-complete");
    const fd = new FormData();
    fd.set("surveyId", "S1");
    fd.set("resultId", "R1");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any));
    expect(res.status).toBe(500);
  });
});
