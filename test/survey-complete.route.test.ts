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
  survey?: any;
  surveyError?: any;
  updateError?: any;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "survey") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts.survey ?? null, error: opts.surveyError ?? null }),
            }),
          }),
        };
      }
      if (table === "survey_response") {
        return {
          update: () => ({
            eq: async () => ({ error: opts.updateError ?? null }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("app/routes/api.survey-complete.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createSupabaseServerClient.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns 405 for non-POST", async () => {
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: makeSupabase({}) });
    const mod = await import("../app/routes/api.survey-complete");
    const res = await mod.action({ request: new Request("http://x", { method: "GET" }) } as any);
    expect(res.status).toBe(405);
  });

  test("validates required fields", async () => {
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: makeSupabase({}) });
    const mod = await import("../app/routes/api.survey-complete");
    const fd = new FormData();
    fd.set("surveyId", "S1");
    const res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.status).toBe(400);
  });

  test("returns 404 when survey not found and 400 when inactive", async () => {
    const mod = await import("../app/routes/api.survey-complete");

    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ survey: null, surveyError: null }),
    });
    const fd1 = new FormData();
    fd1.set("surveyId", "S1");
    fd1.set("resultId", "R1");
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any);
    expect(r1.status).toBe(404);

    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ survey: { id: 1, is_active: false } }),
    });
    const fd2 = new FormData();
    fd2.set("surveyId", "S1");
    fd2.set("resultId", "R1");
    const r2 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any);
    expect(r2.status).toBe(400);
  });

  test("updates completed_at when completed=true and when completed!=true", async () => {
    const mod = await import("../app/routes/api.survey-complete");
    const supabase = makeSupabase({ survey: { id: 1, is_active: true } });
    mocks.createSupabaseServerClient.mockReturnValue({ supabaseClient: supabase });

    const fd1 = new FormData();
    fd1.set("surveyId", "S1");
    fd1.set("resultId", "R1");
    fd1.set("completed", "true");
    const r1 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd1 }) } as any);
    expect(r1.status).toBe(200);

    const fd2 = new FormData();
    fd2.set("surveyId", "S1");
    fd2.set("resultId", "R2");
    fd2.set("completed", "false");
    const r2 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any);
    expect(r2.status).toBe(200);
  });

  test("returns 500 when update fails and logs", async () => {
    mocks.createSupabaseServerClient.mockReturnValueOnce({
      supabaseClient: makeSupabase({ survey: { id: 1, is_active: true }, updateError: { message: "u" } }),
    });
    const mod = await import("../app/routes/api.survey-complete");
    const fd = new FormData();
    fd.set("surveyId", "S1");
    fd.set("resultId", "R1");
    const res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error completing survey:", { message: "u" });
  });

  test("returns 500 on unexpected error (formData throws) and logs", async () => {
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: makeSupabase({}) });
    const mod = await import("../app/routes/api.survey-complete");
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
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in handleCompleteSurvey:", expect.anything());
  });
});

