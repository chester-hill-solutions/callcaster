import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

// The route re-exports its loader from a .server module; importing it for real
// drags the whole server graph (auth → db → twilio/stripe) into jsdom. The
// tests install their own in-router loader instead (same pattern as
// signup.route.test.tsx).
vi.mock("../../app/routes/_index/index.loader.server", () => ({ loader: vi.fn() }));

describe("app/routes/_index/index.tsx home CTAs", () => {
  async function renderIndex(user: unknown) {
    const mod = await import("../../app/routes/_index/index");
    const router = createMemoryRouter(
      [
        {
          path: "/",
          Component: mod.default,
          loader: () => ({ user }),
        },
      ],
      { initialEntries: ["/"] },
    );
    render(createElement(RouterProvider, { router }));
  }

  test("shows Sign Up for a signed-out visitor and links to signup", async () => {
    await renderIndex(null);

    // Hero and bottom CTA both offer signup.
    const signUpLinks = await screen.findAllByRole("link", { name: "Sign Up" });
    expect(signUpLinks.length).toBe(2);
    for (const link of signUpLinks) {
      expect(link.getAttribute("href")).toBe("/signup");
    }
    expect(screen.queryByText("Go to Workspaces")).toBeNull();
  });

  test("shows Go to Workspaces for a signed-in user instead of Sign Up", async () => {
    await renderIndex({ id: "u1", first_name: "Ada" });

    // Both the hero and the bottom CTA use the workspaces link.
    const workspacesLinks = await screen.findAllByRole("link", {
      name: "Go to Workspaces",
    });
    expect(workspacesLinks.length).toBe(2);
    for (const link of workspacesLinks) {
      expect(link.getAttribute("href")).toBe("/workspaces");
    }
    expect(screen.queryByText("Sign Up")).toBeNull();
  });
});