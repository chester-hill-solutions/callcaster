import { describe, expect, test } from "vitest";
import { validatePeopleReturnPath } from "@/lib/people-return-path";

describe("People campaign return paths", () => {
  test("accepts campaign deep links in the current workspace", () => {
    expect(
      validatePeopleReturnPath("/workspaces/w1/campaigns/42/settings", "w1"),
    ).toBe("/workspaces/w1/campaigns/42/settings");
  });

  test("accepts onboarding root in the current workspace", () => {
    expect(validatePeopleReturnPath("/workspaces/w1/onboarding", "w1")).toBe(
      "/workspaces/w1/onboarding",
    );
  });

  test("accepts onboarding step deep links in the current workspace", () => {
    expect(
      validatePeopleReturnPath(
        "/workspaces/w1/onboarding?step=audience",
        "w1",
      ),
    ).toBe("/workspaces/w1/onboarding?step=audience");
  });

  test.each([
    "https://example.com/workspaces/w1/campaigns/42",
    "//example.com/workspaces/w1/campaigns/42",
    "/workspaces/w2/campaigns/42",
    "/workspaces/w2/onboarding?step=audience",
    "/workspaces/w1/contacts",
    "/workspaces/w1/onboarding/extra",
    "/workspaces/w1/campaigns\\42",
  ])("rejects return path %s", (path) => {
    expect(validatePeopleReturnPath(path, "w1")).toBeNull();
  });
});
