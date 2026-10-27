import { describe, expect, test, vi } from "vitest";

const completeLocalCheckout = vi.hoisted(() => vi.fn());
vi.mock("../e2e/fixtures/local-checkout", () => ({ completeLocalCheckout }));
vi.mock("@playwright/test", () => ({
  expect: Object.assign(
    (target: unknown) => ({
      toBeVisible: vi.fn(async () => undefined),
      toHaveURL: vi.fn(async () => undefined),
      toBeGreaterThanOrEqual: vi.fn(async () => undefined),
    }),
    { poll: (callback: () => Promise<unknown>) => ({ toBeGreaterThanOrEqual: async () => callback() }) },
  ),
}));

describe("SIM local mock credit task", () => {
  test("completes the local checkout UI and waits for the credited balance", async () => {
    completeLocalCheckout.mockReset().mockImplementation(async (page: { goto: (url: string) => Promise<void> }) => {
      await page.goto("/confirm-payment?session_id=mock-session");
    });
    let balanceReads = 0;
    const page = {
      goto: vi.fn(async () => undefined),
      getByTestId: vi.fn(() => ({ innerText: async () => (++balanceReads === 1 ? "0 credits" : "500 credits") })),
      getByText: vi.fn(() => ({})),
      getByRole: vi.fn(() => ({ fill: vi.fn(async () => undefined), click: vi.fn(async () => undefined) })),
      getByPlaceholder: vi.fn(() => ({ fill: vi.fn(async () => undefined) })),
    };
    const context = {
      workspaceId: "sim-workspace",
      profile: { expectedRole: "owner", capabilities: ["billing.purchaseTestCredits"] },
    } as never;

    const { ensureSmsCredits } = await import("../e2e/sim/tasks/credits");
    await ensureSmsCredits({
      page: page as never,
      context,
      input: { message: "test message", stripe: { cardNumber: "never-used", expiry: "12/34", cvc: "123" }, checkoutProvider: "mock" },
    });

    expect(page.goto).toHaveBeenCalledWith("/workspaces/sim-workspace/billing");
    expect(completeLocalCheckout).toHaveBeenCalledWith(page);
    expect(page.getByLabel).toBeUndefined();
    expect(balanceReads).toBeGreaterThanOrEqual(2);
  });
});
