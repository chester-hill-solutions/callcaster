import { beforeEach, describe, expect, test, vi } from "vitest";

const flow = vi.hoisted(() => ({ run: undefined as undefined | ((args: unknown, info: unknown) => Promise<void>) }));
const tasks = vi.hoisted(() => ({ credits: vi.fn(), sms: vi.fn(), signIn: vi.fn(), upload: vi.fn() }));
vi.mock("@playwright/test", () => ({
  test: Object.assign((_name: string, run: typeof flow.run) => { flow.run = run; }, { describe: (_name: string, run: () => void) => run() }),
  expect: () => ({ toBeVisible: async () => undefined }),
}));
vi.mock("../e2e/sim/runtime-context", async (importOriginal) => ({
  ...await importOriginal<typeof import("../e2e/sim/runtime-context")>(),
  createSimRuntimeContext: async ({ personaKey }: { personaKey: string }) => ({ profile: { personaKey }, getCredential: vi.fn() }),
}));
vi.mock("../e2e/sim/preflight", async (importOriginal) => ({
  ...await importOriginal<typeof import("../e2e/sim/preflight")>(),
  prepareSimSmsTaskContexts: async ({ owner, member }: { owner: unknown; member: unknown }) => ({ owner, member }),
}));
vi.mock("../e2e/sim/config", async (importOriginal) => ({
  ...await importOriginal<typeof import("../e2e/sim/config")>(),
  createSimBrowserContextOptions: () => ({ baseURL: "http://localhost" }),
  loadSimSmsCompatibilityInput: () => ({ recipient: { phone: "+14165550123" }, message: "fixture" }),
}));
vi.mock("../e2e/sim/tasks/sign-in", () => ({ signInForSim: tasks.signIn }));
vi.mock("../e2e/sim/tasks/contact-list", () => ({ uploadSimContactList: tasks.upload }));
vi.mock("../e2e/sim/tasks/credits", () => ({ ensureSmsCredits: tasks.credits, smsCreditsRequired: () => 1 }));
vi.mock("../e2e/sim/tasks/sms", () => ({ sendSmsFromChats: tasks.sms }));

beforeEach(() => {
  vi.resetModules();
  tasks.signIn.mockResolvedValue(undefined);
  tasks.upload.mockResolvedValue(undefined);
  tasks.credits.mockResolvedValue(undefined);
  tasks.sms.mockResolvedValue(undefined);
});

describe("SIM flow owns each persona browser context", () => {
  test.each(["credits", "sms"] as const)("closes opened contexts when %s fails", async failedTask => {
    tasks[failedTask].mockRejectedValue(new Error("Fixture task failed"));
    const page = {};
    const owner = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn().mockResolvedValue(undefined) };
    const member = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn().mockResolvedValue(undefined) };
    const browser = { newContext: vi.fn().mockResolvedValueOnce(owner).mockResolvedValueOnce(member) };
    await import("../e2e/sim/sms-send.sim.spec");
    if (!flow.run) throw new Error("SIM flow was not collected");
    await expect(flow.run({ browser }, {})).rejects.toThrow("Fixture task failed");
    expect(owner.close).toHaveBeenCalledOnce();
    if (failedTask === "credits") {
      expect(browser.newContext).toHaveBeenCalledOnce();
      expect(member.close).not.toHaveBeenCalled();
    } else {
      expect(browser.newContext).toHaveBeenCalledTimes(2);
      expect(member.close).toHaveBeenCalledOnce();
    }
  });
});
