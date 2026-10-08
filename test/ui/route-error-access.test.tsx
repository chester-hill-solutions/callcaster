import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary";

function renderDenied(status: number, payload: unknown) {
  const router = createMemoryRouter(
    [
      {
        path: "/restricted",
        loader: () => {
          throw new Response(JSON.stringify(payload), {
            status,
            statusText: status === 401 ? "Unauthorized" : "Forbidden",
            headers: { "Content-Type": "application/json" },
          });
        },
        element: <div>Restricted page</div>,
        errorElement: <RouteErrorBoundary />,
      },
      { path: "/signin", element: <h1>Sign-in form</h1> },
      { path: "/workspaces", element: <h1>Workspace picker</h1> },
    ],
    { initialEntries: ["/restricted"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("access responses in the shared route boundary (#2004)", () => {
  test.each([
    [401, "Sign in required", "Sign in", "/signin", "Sign-in form"],
    [
      403,
      "Access denied",
      "Go to workspaces",
      "/workspaces",
      "Workspace picker",
    ],
  ])(
    "%i gives a usable next step",
    async (status, heading, action, href, destination) => {
      const router = renderDenied(status, null);
      expect(
        await screen.findByRole("heading", { name: heading }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Something went wrong"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Reload Page" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      const link = screen.getByRole("link", { name: action });
      expect(link).toHaveAttribute("href", href);
      await userEvent.setup().click(link);
      expect(
        await screen.findByRole("heading", { name: destination }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(href);
    },
  );

  test.each([401, 403])(
    "%i preserves safe string response copy",
    async (status) => {
      renderDenied(status, "Your account needs workspace access.");
      expect(
        await screen.findByText("Your account needs workspace access."),
      ).toBeInTheDocument();
    },
  );

  test.each([
    [
      401,
      { message: "Please sign in to open your campaigns." },
      "Please sign in to open your campaigns.",
    ],
    [
      403,
      { error: "Only workspace administrators can open this page." },
      "Only workspace administrators can open this page.",
    ],
    [
      403,
      {
        message: "Your workspace role cannot create surveys.",
        error: "Forbidden",
      },
      "Your workspace role cannot create surveys.",
    ],
    [
      401,
      { message: null, error: "Your session has expired. Please sign in." },
      "Your session has expired. Please sign in.",
    ],
  ])(
    "%i reads safe message/error payloads",
    async (status, payload, expected) => {
      renderDenied(status, payload);
      expect(await screen.findByText(expected)).toBeInTheDocument();
    },
  );

  test.each([
    [401, null, "Sign in to continue to this page."],
    [
      403,
      null,
      "You don't have permission to view this page. Contact your workspace administrator if you need access.",
    ],
    [401, "Unauthorized", "Sign in to continue to this page."],
    [
      403,
      "Forbidden.",
      "You don't have permission to view this page. Contact your workspace administrator if you need access.",
    ],
    [
      401,
      { message: "Connection terminated unexpectedly" },
      "Sign in to continue to this page.",
    ],
    [
      403,
      { error: 'Failed query: select * from "user"' },
      "You don't have permission to view this page. Contact your workspace administrator if you need access.",
    ],
    [
      403,
      { error: 403 },
      "You don't have permission to view this page. Contact your workspace administrator if you need access.",
    ],
  ])(
    "%i replaces technical or unusable copy",
    async (status, payload, expected) => {
      renderDenied(status, payload);
      expect(await screen.findByText(expected)).toBeInTheDocument();
      expect(
        screen.queryByText("Connection terminated unexpectedly"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Failed query/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          /^(401 Unauthorized|403 Forbidden|Unauthorized|Forbidden\.)$/,
        ),
      ).not.toBeInTheDocument();
    },
  );
});
