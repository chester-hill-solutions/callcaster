import { describe, expect, test } from "vitest";

import { loadSurveyDetailByPublicId } from "@/lib/survey-db.server";

describe("loadSurveyDetailByPublicId", () => {
  test("returns null for non-uuid public ids without querying the database", async () => {
    await expect(
      loadSurveyDetailByPublicId("not-a-real-survey-id", { activeOnly: true }),
    ).resolves.toBeNull();
  });
});
