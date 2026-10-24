import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  test("#2013: uses the shared auth layout and sign-in card width", async () => {
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

    await screen.findByRole("heading", { level: 1, name: "Sign Up" });

    const main = container.querySelector("main");
    expect(main).toHaveClass("w-full", "flex-1", "justify-center", "py-8");
    expect(main).not.toHaveClass("min-h-screen");
    // The form uses one centered max-w-xl wrapper, matching the sign-in page.
    expect(container.querySelector(".max-w-md")).toBeNull();
    expect(container.querySelector("main .max-w-xl")).not.toBeNull();
  });

  // #2216: with requireEmailVerification, registration issues no session. The
  // page must say a link was sent to the address and stop offering the form,
  // because nothing the user can click there would sign them in.
  test("states that a verification link was sent instead of leaving the form up", async () => {
    const mod = await import("../../app/routes/signup");
    const router = createMemoryRouter(
      [
        {
          path: "/signup",
          Component: mod.default,
          loader: () => ({ signupOpen: true }),
          action: () => ({ verificationSent: { email: "new@example.com" } }),
        },
      ],
      { initialEntries: ["/signup"] },
    );
    render(createElement(RouterProvider, { router }));

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Check your email",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/new@example\.com/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to sign in" }),
    ).toBeInTheDocument();
  });
});
