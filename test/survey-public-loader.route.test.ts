import { beforeEach, describe, expect, test, vi } from "vitest";

import { routeArgs, asRouteResponse } from "./helpers/route-result";
import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret";
});

const surveyDbMocks = vi.hoisted(() => ({
  loadSurveyDetailByPublicId: vi.fn(async () => ({
    id: 1,
    survey_id: "public-survey",
    is_active: true,
    workspace: "ws-1",
    survey_page: [],
    survey_response: [{ count: 0 }],
  })),
  loadSurveyRespondentContact: vi.fn(async () => ({
    id: 100,
    firstname: "Dana",
    surname: "Whitfield",
  })),
  loadExistingResponseWithAnswers: vi.fn(async () => ({
    response: null,
    answers: {},
  })),
}));

vi.mock("@/lib/survey-db.server", () => ({
  loadSurveyDetailByPublicId: (...args: unknown[]) =>
    surveyDbMocks.loadSurveyDetailByPublicId(...args),
  loadExistingResponseWithAnswers: (...args: unknown[]) =>
    surveyDbMocks.loadExistingResponseWithAnswers(...args),
}));

vi.mock("@/lib/survey-respondent.server", () => ({
  loadSurveyRespondentContact: (...args: unknown[]) =>
    surveyDbMocks.loadSurveyRespondentContact(...args),
}));

function req(query = "") {
  return new Request(`http://x/survey/public-survey${query}`);
}

describe("public survey loader", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    vi.clearAllMocks();
  });

  test("scopes the contact lookup to the survey's workspace", async () => {
    const mod = await import("../app/routes/survey+/$surveyId.loader.server");
    await mod.loader(routeArgs(req("?contact=100"), { surveyId: "public-survey" }) as never);

    // The workspace must come from the loaded survey, never from the request —
    // this is what makes a cross-tenant id unresolvable rather than merely
    // filtered after the fact.
    expect(surveyDbMocks.loadSurveyRespondentContact).toHaveBeenCalledWith(100, "ws-1");
  });

  test("returns no contact when the id belongs to another workspace", async () => {
    // A scoped query yields no row for a foreign contact.
    surveyDbMocks.loadSurveyRespondentContact.mockResolvedValueOnce(null as never);

    const mod = await import("../app/routes/survey+/$surveyId.loader.server");
    const result = await mod.loader(
      routeArgs(req("?contact=999"), { surveyId: "public-survey" }) as never,
    );

    const payload = (result as { data: { contact: unknown } }).data;
    expect(payload.contact).toBeNull();
  });

  test("exposes only the fields the survey page renders", async () => {
    const mod = await import("../app/routes/survey+/$surveyId.loader.server");
    const result = await mod.loader(
      routeArgs(req("?contact=100"), { surveyId: "public-survey" }) as never,
    );

    // This route is unauthenticated. Anything selected here is public, so the
    // projection — not the caller — is what keeps phone/email/address out.
    const payload = (result as { data: { contact: Record<string, unknown> } }).data;
    expect(Object.keys(payload.contact).sort()).toEqual(["firstname", "id", "surname"]);
  });

  test("rate-limits contact-id enumeration", async () => {
    const mod = await import("../app/routes/survey+/$surveyId.loader.server");

    // The limit is 20/minute; the 21st lookup from one client must be refused.
    for (let i = 0; i < 20; i++) {
      await mod.loader(routeArgs(req(`?contact=${i}`), { surveyId: "public-survey" }) as never);
    }
    const response = await asRouteResponse(
      mod.loader(routeArgs(req("?contact=21"), { surveyId: "public-survey" }) as never),
    );

    expect(response.status).toBe(429);
  });

  test("does not look up a contact when none is requested", async () => {
    const mod = await import("../app/routes/survey+/$surveyId.loader.server");
    await mod.loader(routeArgs(req(), { surveyId: "public-survey" }) as never);

    expect(surveyDbMocks.loadSurveyRespondentContact).not.toHaveBeenCalled();
  });
});
