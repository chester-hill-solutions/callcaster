import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import SignIn from "../../app/routes/signin";
import { Toaster } from "../../app/components/ui/sonner";

vi.mock("../../app/routes/signin.action.server", () => ({ action: vi.fn() }));
vi.mock("../../app/routes/signin.loader.server", () => ({ loader: vi.fn() }));

afterEach(async () => {
  toast.dismiss();
  await waitFor(() => expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(0), { timeout: 3_000 });
  cleanup();
  vi.restoreAllMocks();
});

describe("sign-in feedback", () => {
  test.each([
    "Invalid email or password.",
    "Too many sign-in attempts. Wait a minute and try again.",
    "We couldn't sign you in. Try again shortly.",
  ])("shows %s once through the root toaster and retains the form", async (message) => {
    const user = userEvent.setup();
    const error = vi.spyOn(toast, "error");
    const router = createMemoryRouter([
      { path: "/signin", Component: SignIn, action: () => ({ error: message }) },
    ], { initialEntries: ["/signin"] });
    render(<><RouterProvider router={router} /><Toaster position="top-right" /></>);
    await user.type(screen.getByLabelText("Email"), "person@example.test");
    await user.type(screen.getByLabelText("Password"), "retry-password");
    const main = screen.getByRole("main");
    const field = screen.getByLabelText("Password");
    await user.click(screen.getByRole("button", { name: "Login" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(message));
    await waitFor(() => expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(1));
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(within(main).queryByText(message)).not.toBeInTheDocument();
    expect(field).toBe(screen.getByLabelText("Password"));
    expect(field).toHaveValue("retry-password");
    await act(async () => { router.revalidate(); });
    await waitFor(() => expect(router.state.revalidation).toBe("idle"));
    expect(error).toHaveBeenCalledTimes(1);
  });
});
