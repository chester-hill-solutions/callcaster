import { describe, expect, it } from "vitest";
import { DEV_CULL_KEEP_WORKSPACE_IDS } from "../scripts/cull-keep-list.mjs";
import { workspaceCullVerdict } from "../scripts/cull-report-policy.mjs";

describe("workspaceCullVerdict", () => {
  it("keeps the confirmed phone-named workspace before applying the cull rule", () => {
    expect(DEV_CULL_KEEP_WORKSPACE_IDS).toEqual([
      "701582c0-4af4-451f-a53b-454de7738bbb",
      "a87c081c-23c4-4046-823d-466f6d087e4e",
      "5dc1da78-9ac3-4f26-807a-077898a7cf72",
    ]);
    expect(
      workspaceCullVerdict({
        id: "701582c0-4af4-451f-a53b-454de7738bbb",
        name: "2608141501",
        last_any: null,
      }),
    ).toEqual({ verdict: "KEEP", why: "keep-list", ageDays: null });
  });

  it("still culls other phone-named workspaces", () => {
    expect(
      workspaceCullVerdict({
        id: "not-on-the-keep-list",
        name: "260804124",
        last_any: "2020-01-01T00:00:00.000Z",
      }),
    ).toMatchObject({ verdict: "CULL", why: "named after a phone number" });
  });
});
