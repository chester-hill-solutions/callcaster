import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

// The route re-exports its loader/action from .server modules; importing them
// for real drags the whole server graph (auth → db → twilio/stripe) into
// jsdom, which is slow enough to blow the test timeout under suite load. The
// tests below install their own in-router loaders anyway.
vi.mock("../../app/routes/signup.loader.server", () => ({ loader: vi.fn() }));
vi.mock("../../app/routes/signup.action.server", () => ({ action: vi.fn() }));

describe("app/routes/signup.tsx", () => {
  test("shows the Sign Up card as the only page heading when registration is open", async () => {
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

    expect(
      await screen.findByRole("heading", { level: 1, name: "Sign Up" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Up" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByText("Create Account")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  test("keeps the request-access form when registration is closed", async () => {
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

    expect(
      await screen.findByRole("heading", { level: 1, name: "Request Access" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Send Message" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  test("#2013: centers the layout and uses the sign-in card width and padding", async () => {
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
    const { container } = render(createElement(RouterProvider, { router }));

    await screen.findByText("Create Account");

    const main = container.querySelector("main");
    expect(main).toHaveClass("justify-center", "py-12");
    expect(main).not.toHaveClass("py-8");
    // The card drops the max-w-md wrapper and py-2 override, so it renders
    // at the AuthCard default width (max-w-xl) with default padding — the
    // same box the sign-in page uses.
    expect(container.querySelector(".max-w-md")).toBeNull();
    expect(container.querySelector("main .max-w-xl")).not.toBeNull();
  });
});
