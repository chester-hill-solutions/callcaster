import { afterEach, describe, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import ResetPassword from "../../app/routes/reset-password";
import { Toaster } from "../../app/components/ui/sonner";

vi.mock("../../app/routes/reset-password.action.server", () => ({
  action: vi.fn(),
}));
vi.mock("../../app/routes/reset-password.loader.server", () => ({
  loader: vi.fn(),
}));

afterEach(async () => {
  toast.dismiss();
  await waitFor(
    () =>
      expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(0),
    {
      timeout: 3_000,
    },
  );
  cleanup();
  vi.restoreAllMocks();
});

function showReset(
  action: () => { success: boolean | null; error: { message: string } | null },
) {
  const router = createMemoryRouter(
    [{ path: "/reset-password", Component: ResetPassword, action }],
    { initialEntries: ["/reset-password?token=issued-token"] },
  );
  render(
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </>,
  );
  return router;
}

describe("reset password feedback", () => {
  test.each([
    "Passwords do not match",
    "This reset link is invalid or has expired. Request a new one from the sign-in page.",
  ])(
    "shows %s once through the real root toaster without replay",
    async (message) => {
      const user = userEvent.setup();
      const error = vi.spyOn(toast, "error");
      const router = showReset(() => ({ success: null, error: { message } }));
      await user.type(
        screen.getByLabelText("New Password"),
        "keep-my-password",
      );
      await user.type(
        screen.getByLabelText("Confirm New Password"),
        "keep-my-password",
      );
      const main = screen.getByRole("main");
      const field = screen.getByLabelText("New Password");
      await user.click(screen.getByRole("button", { name: "Reset Password" }));
      await waitFor(() => expect(error).toHaveBeenCalledWith(message));
      await waitFor(() =>
        expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(
          1,
        ),
      );
      expect(screen.getAllByText(message)).toHaveLength(1);
      expect(within(main).queryByText(message)).not.toBeInTheDocument();
      expect(field).toBe(screen.getByLabelText("New Password"));
      expect(field).toHaveValue("keep-my-password");
      expect(screen.getByLabelText("Confirm New Password")).toHaveValue(
        "keep-my-password",
      );
      await act(async () => {
        router.revalidate();
      });
      await waitFor(() => expect(router.state.revalidation).toBe("idle"));
      expect(error).toHaveBeenCalledTimes(1);
      expect(screen.getAllByText(message)).toHaveLength(1);
    },
  );

  test("keeps failed values for a retry and reports success only after acceptance", async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, "success");
    const action = vi
      .fn()
      .mockReturnValueOnce({
        success: null,
        error: { message: "Try again later" },
      })
      .mockReturnValueOnce({ success: true, error: null });
    showReset(action);
    await user.type(screen.getByLabelText("New Password"), "retry-password");
    await user.type(
      screen.getByLabelText("Confirm New Password"),
      "retry-password",
    );
    await user.click(screen.getByRole("button", { name: "Reset Password" }));
    await screen.findByText("Try again later");
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByLabelText("New Password")).toHaveValue("retry-password");
    await user.click(screen.getByRole("button", { name: "Reset Password" }));
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        "Password updated. You can now sign in.",
      ),
    );
    expect(action).toHaveBeenCalledTimes(2);
    expect(
      within(screen.getByRole("main")).queryByText("Try again later"),
    ).not.toBeInTheDocument();
  });
});
