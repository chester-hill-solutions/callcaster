import type { TestInfo } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { createSimBrowserContextOptions, SIM_BASE_URL_FALLBACK } from "../e2e/sim/config";

type SimProjectInfo = Pick<TestInfo, "project">;

describe("SIM browser context options", () => {
  it("passes the active Playwright project base URL to each manual context", () => {
    expect(
      createSimBrowserContextOptions({ project: { use: { baseURL: "https://sim.example.test" } } } as SimProjectInfo),
    ).toEqual({ baseURL: "https://sim.example.test" });
  });

  it("uses the local SIM target when the project does not define a base URL", () => {
    expect(createSimBrowserContextOptions({ project: { use: {} } } as SimProjectInfo)).toEqual({
      baseURL: SIM_BASE_URL_FALLBACK,
    });
  });
});
