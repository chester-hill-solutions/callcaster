import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, redirect, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("../../app/routes/mock-checkout.$sessionId.loader.server", () => ({ loader: vi.fn() }));
vi.mock("../../app/routes/mock-checkout.$sessionId.action.server", () => ({ action: vi.fn() }));

// The real membership and ledger behavior is covered by billing-local-checkout.test.ts.
describe("local checkout form", () => {
  test("shows the credit amount and submits once while completion is pending", async () => {
    const { default: Checkout } = await import("../../app/routes/mock-checkout.$sessionId");
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const action = vi.fn(async ({ request }: { request: Request }) => {
      expect(request.method).toBe("POST");
      await pending;
      return redirect("/confirmed");
    });
    const router = createMemoryRouter([
      { path: "/mock-checkout/:sessionId", Component: Checkout, loader: () => ({ creditAmount: 500 }), action },
      { path: "/confirmed", Component: () => createElement("p", null, "Payment complete") },
    ], { initialEntries: ["/mock-checkout/mock_fixture"] });
    render(createElement(RouterProvider, { router }));
    try {
      expect(await screen.findByRole("heading", { name: "Local test checkout" })).toBeInTheDocument();
      expect(screen.getByText(/Add 500 workspace credits/)).toBeInTheDocument();
      const button = screen.getByRole("button", { name: "Complete local test payment" });
      const user = userEvent.setup();
      await user.click(button);
      await waitFor(() => expect(button).toBeDisabled());
      await user.click(button);
      expect(action).toHaveBeenCalledOnce();
      finish();
      expect(await screen.findByText("Payment complete")).toBeInTheDocument();
    } finally { finish(); router.dispose(); }
  });
});
