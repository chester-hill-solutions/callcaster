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
import SignIn from "../../app/routes/signin";
import { Toaster } from "../../app/components/ui/sonner";

vi.mock("../../app/routes/reset-password.action.server", () => ({
  action: vi.fn(),
}));
vi.mock("../../app/routes/reset-password.loader.server", () => ({
  loader: vi.fn(),
}));

vi.mock("../../app/routes/signin.action.server", () => ({ action: vi.fn() }));
vi.mock("../../app/routes/signin.loader.server", () => ({ loader: vi.fn() }));

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
  action: () =>
    | { success: boolean | null; error: { message: string } | null }
    | Promise<{ success: boolean | null; error: { message: string } | null }>,
  loader: () => { token: string | null; error: string | null } = () => ({
    token: "issued-token",
    error: null,
  }),
) {
  const router = createMemoryRouter(
    [
      { path: "/reset-password", Component: ResetPassword, action, loader },
      { path: "/signin", Component: SignIn },
    ],
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
  // #2075: Better Auth's callback redirects with ?error=INVALID_TOKEN when the
  // token is expired or unknown. The form used to render as if the link worked.
  test("an unusable link says so up front and offers a new one", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/reset-password",
          Component: ResetPassword,
          action: vi.fn(),
          loader: () => ({ token: null, error: "INVALID_TOKEN" }),
        },
        { path: "/remember", Component: () => <h1>Remember</h1> },
      ],
      { initialEntries: ["/reset-password?error=INVALID_TOKEN"] },
    );
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByText(/reset link is invalid or has expired/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("New Password")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request a new link" }),
    ).toHaveAttribute("href", "/remember");
  });

  // #2661: opened without a token at all, the page must not ask for a password.
  test("an incomplete link says so up front and offers a new one", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/reset-password",
          Component: ResetPassword,
          action: vi.fn(),
          loader: () => ({ token: null, error: null }),
        },
        { path: "/remember", Component: () => <h1>Remember</h1> },
      ],
      { initialEntries: ["/reset-password"] },
    );
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByText(
        "This reset link is incomplete. Request a new link to continue.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("New Password")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request a new link" }),
    ).toHaveAttribute("href", "/remember");
  });

  test("the form states the password rule it enforces", async () => {
    showReset(() => ({ success: null, error: null }));

    expect(
      await screen.findByText("Password must be at least 8 characters."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New Password")).toHaveAttribute(
      "minlength",
      "8",
    );
  });

  // Only the token failure code hides the form. Any other error value is not a
  // reason to tell the user their link is unusable.
  test("an unrecognised error code still shows the form", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/reset-password",
          Component: ResetPassword,
          action: vi.fn(),
          loader: () => ({ token: "issued-token", error: "SOMETHING_ELSE" }),
        },
      ],
      { initialEntries: ["/reset-password?error=SOMETHING_ELSE"] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByLabelText("New Password")).toBeInTheDocument();
    expect(
      screen.queryByText(/reset link is invalid or has expired/i),
    ).not.toBeInTheDocument();
  });

  test.each([
    "Passwords do not match",
    "This reset link is invalid or has expired. Request a new one from the sign-in page.",
  ])(
    "shows %s once through the real root toaster without replay",
    async (message) => {
      const user = userEvent.setup();
      const error = vi.spyOn(toast, "error");
      const router = showReset(() => ({ success: null, error: { message } }));
      await screen.findByLabelText("New Password");
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
      expect(router.state.location.pathname).toBe("/reset-password");
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

  test("keeps failures for retry, then replaces the reset route with Sign In after acceptance", async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, "success");
    let acceptReset: (() => void) | undefined;
    const accepted = new Promise<{ success: true; error: null }>((resolve) => {
      acceptReset = () => resolve({ success: true, error: null });
    });
    const action = vi
      .fn()
      .mockReturnValueOnce({
        success: null,
        error: { message: "Try again later" },
      })
      .mockReturnValueOnce(accepted);
    const router = showReset(action);
    await screen.findByLabelText("New Password");
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
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(router.state.location.pathname).toBe("/reset-password");
    expect(success).not.toHaveBeenCalled();
    await act(async () => acceptReset?.());
    await screen.findByRole("heading", { name: "Login", exact: true });
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        "Password updated. You can now sign in.",
      ),
    );
    expect(action).toHaveBeenCalledTimes(2);
    expect(router.state.location.pathname).toBe("/signin");
    expect(router.state.location.search).toBe("");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.queryByLabelText("New Password")).not.toBeInTheDocument();
    expect(screen.getAllByText("Password updated. You can now sign in.")).toHaveLength(1);
    expect(success).toHaveBeenCalledTimes(1);
    await act(async () => { router.revalidate(); });
    await waitFor(() => expect(router.state.revalidation).toBe("idle"));
    expect(success).toHaveBeenCalledTimes(1);
    expect(
      within(screen.getByRole("main")).queryByText("Try again later"),
    ).not.toBeInTheDocument();
  });
});
