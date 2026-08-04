import { describe, expect, test, vi } from "vitest";

import { isInvalidTextRepresentation } from "@/lib/parse-utils.server";
import { loadSurveyDetailByPublicId } from "@/lib/survey-db.server";
import { db } from "@/server/db";

describe("isInvalidTextRepresentation", () => {
  test("detects Postgres invalid uuid cast errors", () => {
    expect(isInvalidTextRepresentation({ code: "22P02" })).toBe(true);
    expect(isInvalidTextRepresentation({ code: "23505" })).toBe(false);
    expect(isInvalidTextRepresentation(null)).toBe(false);
  });
});

describe("loadSurveyDetailByPublicId", () => {
  test("returns null when Postgres rejects the public id format", async () => {
    vi.spyOn(db, "select").mockImplementation(() => {
      throw { code: "22P02" };
    });

    await expect(
      loadSurveyDetailByPublicId("not-a-real-survey-id", { activeOnly: true }),
    ).resolves.toBeNull();
  });
});
