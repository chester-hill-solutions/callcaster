import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession, setDualAuthSession } from "./helpers/route-auth-mock";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const surveyDbMocks = vi.hoisted(() => ({
  submitSurveyResponse: vi.fn(async () => ({
    ok: true as const,
    response_id: 10,
    result_id: "R1",
  })),
}));

vi.mock("@/lib/survey-db.server", () => ({
  submitSurveyResponse: (...args: unknown[]) => surveyDbMocks.submitSurveyResponse(...args),
}));

function makeReq(form: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) fd.set(k, v);
  return new Request("http://x", { method: "POST", body: fd });
}

describe("app/routes/api+/survey-responses/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    surveyDbMocks.submitSurveyResponse.mockReset();
    surveyDbMocks.submitSurveyResponse.mockResolvedValue({
      ok: true,
      response_id: 10,
      result_id: "R1",
    });
  });

  test("returns 405 for non-POST", async () => {
    queueDualAuthSession({ supabaseClient: {} });
    const mod = await import("../app/routes/api+/survey-responses");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "GET" }) } as any));
    expect(res.status).toBe(405);
  });

  test("validates required fields and bad JSON", async () => {
    setDualAuthSession({ supabaseClient: {} });
    const mod = await import("../app/routes/api+/survey-responses");

    const r0 = await asRouteResponse(await mod.action({ request: makeReq({ surveyId: "S1" }) } as any));
    expect(r0.status).toBe(400);

    const r1 = await asRouteResponse(await mod.action({
      request: makeReq({ surveyId: "", responseData: JSON.stringify({}) }),
    } as any));
    expect(r1.status).toBe(400);

    const r2 = await asRouteResponse(await mod.action({
      request: makeReq({ surveyId: "S1", responseData: "not-json" }),
    } as any));
    expect(r2.status).toBe(400);
  });

  test("returns 404 when survey missing and 400 when inactive", async () => {
    const mod = await import("../app/routes/api+/survey-responses");

    queueDualAuthSession({ supabaseClient: {} });
    surveyDbMocks.submitSurveyResponse.mockResolvedValueOnce({
      ok: false,
      error: "Survey not found",
      status: 404,
    });
    const r1 = await asRouteResponse(await mod.action({
      request: makeReq({ surveyId: "S1", responseData: JSON.stringify({ result_id: "R1" }) }),
    } as any));
    expect(r1.status).toBe(404);

    queueDualAuthSession({ supabaseClient: {} });
    surveyDbMocks.submitSurveyResponse.mockResolvedValueOnce({
      ok: false,
      error: "Survey is not active",
      status: 400,
    });
    const r2 = await asRouteResponse(await mod.action({
      request: makeReq({ surveyId: "S1", responseData: JSON.stringify({ result_id: "R1" }) }),
    } as any));
    expect(r2.status).toBe(400);
  });

  test("returns 500 when submit fails", async () => {
    queueDualAuthSession({ supabaseClient: {} });
    surveyDbMocks.submitSurveyResponse.mockResolvedValueOnce({
      ok: false,
      error: "Failed to submit response",
      status: 500,
    });
    const mod = await import("../app/routes/api+/survey-responses");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ surveyId: "S1", responseData: JSON.stringify({ result_id: "R1" }) }),
    } as any));
    expect(res.status).toBe(500);
  });

  test("returns success payload from submitSurveyResponse", async () => {
    queueDualAuthSession({ supabaseClient: {} });
    surveyDbMocks.submitSurveyResponse.mockResolvedValueOnce({
      ok: true,
      response_id: 11,
      result_id: "R1",
    });
    const mod = await import("../app/routes/api+/survey-responses");
    const responseData = {
      result_id: "R1",
      completed: true,
      last_page_completed: "p1",
      answers: [{ question_id: "Q1", answer_value: "yes" }],
    };
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        surveyId: "S1",
        responseData: JSON.stringify(responseData),
      }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      response_id: 11,
      result_id: "R1",
    });
    expect(surveyDbMocks.submitSurveyResponse).toHaveBeenCalledWith({
      surveyPublicId: "S1",
      responseData,
    });
  });
});
