import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary";
import { ErrorBoundary } from "@/root";

vi.mock("@/root.loader.server", () => ({ loader: () => null }));
vi.mock("@/components/layout/Navbar", () => ({ default: () => null }));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  Meta: () => null,
  Links: () => null,
  Scripts: () => null,
}));

function renderResponse(
  boundary: "nested" | "root",
  status: number,
  statusText: string,
  payload: unknown,
  json = true,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        loader: () => {
          throw new Response(json ? JSON.stringify(payload) : String(payload), {
            status,
            statusText,
            headers: json ? { "Content-Type": "application/json" } : undefined,
          });
        },
        element: <div>Page content</div>,
        errorElement:
          boundary === "root" ? <ErrorBoundary /> : <RouteErrorBoundary />,
      },
    ],
    { initialEntries: ["/"] },
  );
  render(
    <RouterProvider router={router} />,
    boundary === "root" ? { container: document.documentElement } : undefined,
  );
  return router;
}

const safeCases: [number, string, unknown, string, boolean][] = [
  [
    409,
    "Conflict",
    "Campaign is already running.",
    "Campaign is already running.",
    false,
  ],
  [
    422,
    "Unprocessable Entity",
    { error: "Campaign name is required." },
    "Campaign name is required.",
    true,
  ],
  [
    400,
    "Bad Request",
    { message: "Choose a valid campaign.", error: "Ignored message." },
    "Choose a valid campaign.",
    true,
  ],
  [
    409,
    "Conflict",
    { message: null, error: "Campaign is already running." },
    "Campaign is already running.",
    true,
  ],
];
const rejectedCases: [string, unknown][] = [
  ["absent", null],
  ["empty", ""],
  ["unknown shape", { detail: "Campaign is already running." }],
  ["numeric error", { error: 500 }],
  ["nested object", { error: { message: "Campaign is already running." } }],
  ["driver string", "Connection terminated unexpectedly"],
  ["driver error field", { error: "Connection reset by peer" }],
  ["internal sentence", "Internal database detail"],
  ["plain query", { message: "Failed query: select workspace from campaign" }],
];

for (const boundary of ["nested", "root"] as const) {
  describe(`${boundary} safe response messages (#2123)`, () => {
    test.each(safeCases)(
      "%i preserves intentional response copy %#",
      async (status, statusText, payload, expected, json) => {
        const router = renderResponse(
          boundary,
          status,
          statusText,
          payload,
          json,
        );
        expect(await screen.findByText(expected)).toBeInTheDocument();
        expect(screen.queryByText("Page content")).not.toBeInTheDocument();
        expect(router.state.errors).not.toBeNull();
        expect(
          screen.getByRole("button", {
            name: boundary === "root" ? "Try again" : "Reload Page",
          }),
        ).toBeInTheDocument();
      },
    );

    test.each(rejectedCases)(
      "%s uses the existing fallback",
      async (_name, payload) => {
        renderResponse(boundary, 500, "Internal Server Error", payload);
        expect(
          await screen.findByText(
            boundary === "root"
              ? "Something went wrong handling your request."
              : "500 Internal Server Error",
          ),
        ).toBeInTheDocument();
        expect(
          screen.queryByText("Connection terminated unexpectedly"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText("Connection reset by peer"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText("Internal database detail"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText("Failed query: select workspace from campaign"),
        ).not.toBeInTheDocument();
      },
    );

    test("404 retains not-found treatment even with response copy", async () => {
      renderResponse(
        boundary,
        404,
        "Not Found",
        "Campaign is already running.",
      );
      expect(await screen.findByText("Page not found")).toBeInTheDocument();
      expect(
        screen.queryByText("Campaign is already running."),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Go back" }),
      ).toBeInTheDocument();
    });
  });
}

test("nested 403 retains the original safe explanation and access action", async () => {
  renderResponse(
    "nested",
    403,
    "Forbidden",
    "You do not have access to this workspace",
    false,
  );
  expect(
    await screen.findByText("You do not have access to this workspace"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Access denied" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Go to workspaces" }),
  ).toHaveAttribute("href", "/workspaces");
  expect(
    screen.queryByRole("button", { name: "Reload Page" }),
  ).not.toBeInTheDocument();
});
