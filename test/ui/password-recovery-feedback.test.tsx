import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import Remember from "../../app/routes/remember";
import ResetPassword from "../../app/routes/reset-password";

vi.mock("../../app/routes/remember.action.server", () => ({ action: vi.fn() }));
vi.mock("../../app/routes/reset-password.action.server", () => ({
  action: vi.fn(),
}));
vi.mock("../../app/routes/reset-password.loader.server", () => ({
  loader: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function showRemember(result: {
  data: { success: boolean } | null;
  error: { message: string } | null;
}) {
  const router = createMemoryRouter(
    [{ path: "/remember", Component: Remember, action: () => result }],
    { initialEntries: ["/remember"] },
  );
  render(<RouterProvider router={router} />);
}
describe("password recovery feedback", () => {
  test("initial render shows no success before a reset request", () => {
    showRemember({ data: { success: true }, error: null });
    expect(toast.success).not.toHaveBeenCalled();
  });
  test("a submitted acceptance shows generic feedback without claiming account existence or delivery", async () => {
    showRemember({ data: { success: true }, error: null });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "unknown@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "If this email exists in our system, check your email for the reset link.",
      ),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
  test("an error does not produce a success toast", async () => {
    showRemember({ data: null, error: { message: "Email is required" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Email is required"),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
  test("a completed password change reports the correct credential", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/reset-password",
          Component: ResetPassword,
          action: () => ({ success: true, error: null }),
        },
      ],
      { initialEntries: ["/reset-password?token=issued-token"] },
    );
    render(<RouterProvider router={router} />);
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "new-password-2075" },
    });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: "new-password-2075" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Password updated. You can now sign in.",
      ),
    );
  });
});
