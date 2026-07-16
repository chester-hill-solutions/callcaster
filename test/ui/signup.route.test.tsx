import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

// Regression test for audit-F DESIGN.md violation #3: /signup used to render
// two <h1> elements ("Sign Up" from the page itself, "Create Account" from
// AuthCard baking a level-1 Heading into every card). AuthCard now defaults
// to h1 but signup.tsx opts its AuthCard usages into headingAs="h2" since the
// page already renders its own h1. This covers both branches of signup.tsx
// (registration open vs. closed), since both used to double up.
describe("app/routes/signup.tsx heading structure", () => {
  test("renders exactly one h1 when signup is open (registration form)", async () => {
    const mod = await import("../../app/routes/signup");
    const router = createMemoryRouter(
      [
        {
          path: "/signup",
          Component: mod.default,
          loader: () => ({ signupOpen: true }),
        },
      ],
      { initialEntries: ["/signup"] },
    );
    render(createElement(RouterProvider, { router }));

    expect(await screen.findByText("Create Account")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Sign Up" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Create Account" }),
    ).toBeInTheDocument();
  });

  test("renders exactly one h1 when signup is closed (request-access form)", async () => {
    const mod = await import("../../app/routes/signup");
    const router = createMemoryRouter(
      [
        {
          path: "/signup",
          Component: mod.default,
          loader: () => ({ signupOpen: false }),
        },
      ],
      { initialEntries: ["/signup"] },
    );
    render(createElement(RouterProvider, { router }));

    expect(await screen.findByText("Request Access")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 2, name: "Request Access" }),
    ).toBeInTheDocument();
  });
});
