import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn(), theme: "light", resolvedTheme: "light" }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("app/components/shared/AuthCard.tsx", () => {
  test("renders title, description, header content, and children", async () => {
    const { AuthCard } = await import("@/components/shared/AuthCard");
    render(
      <AuthCard
        title="Sign in"
        description="Welcome back"
        headerContent={<span>header extra</span>}
      >
        <button type="button">Continue</button>
      </AuthCard>,
    );
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("header extra")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });
});

describe("app/components/shared/BrandedCard.tsx", () => {
  test("renders card, title, content, and action areas", async () => {
    const {
      BrandedCard,
      BrandedCardActions,
      BrandedCardContent,
      BrandedCardSecondaryActions,
      BrandedCardTitle,
    } = await import("@/components/shared/BrandedCard");
    render(
      <BrandedCard>
        <BrandedCardTitle>Card title</BrandedCardTitle>
        <BrandedCardContent>Card body</BrandedCardContent>
        <BrandedCardActions>
          <button type="button">Primary</button>
        </BrandedCardActions>
        <BrandedCardSecondaryActions>
          <button type="button">Secondary</button>
        </BrandedCardSecondaryActions>
      </BrandedCard>,
    );
    expect(screen.getByText("Card title")).toBeInTheDocument();
    expect(screen.getByText("Card body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Secondary" })).toBeInTheDocument();
  });
});

describe("app/components/shared/ErrorBoundary.tsx", () => {
  test("renders children when there is no error", async () => {
    const { ErrorBoundary } = await import("@/components/shared/ErrorBoundary");
    render(
      <ErrorBoundary>
        <span>all good</span>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  test("renders the default error UI when a child throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ErrorBoundary } = await import("@/components/shared/ErrorBoundary");
    const Thrower = () => {
      throw new Error("child exploded");
    };
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("child exploded")).toBeInTheDocument();
  });

  test("renders a custom fallback when a child throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ErrorBoundary } = await import("@/components/shared/ErrorBoundary");
    const onError = vi.fn();
    const Thrower = () => {
      throw new Error("boom");
    };
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>} onError={onError}>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom fallback")).toBeInTheDocument();
    expect(onError).toHaveBeenCalled();
  });
});

describe("app/components/shared/InfoPopover.tsx", () => {
  test("renders the info tooltip trigger", async () => {
    const InfoPopover = (await import("@/components/shared/InfoPopover")).default;
    render(<InfoPopover tooltip="Helpful hint" size={16} align="start" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeTruthy();
  });
});

describe("app/components/shared/mode-toggle.tsx", () => {
  test("renders the theme toggle button", async () => {
    const { ModeToggle } = await import("@/components/shared/mode-toggle");
    render(<ModeToggle />);
    const trigger = screen.getByRole("button", { name: /toggle theme/i });
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
  });
});

describe("app/components/shared/QueryParamBanner.tsx", () => {
  const variants = {
    saved: {
      title: "Saved",
      description: "Your changes were saved",
      className: "banner-saved",
    },
  };

  test("shows the matching variant and dismisses it", async () => {
    const { QueryParamBanner } = await import(
      "@/components/shared/QueryParamBanner"
    );
    render(
      <MemoryRouter initialEntries={["/?status=saved&detail=1"]}>
        <QueryParamBanner
          param="status"
          variants={variants}
          clearParams={["detail"]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Your changes were saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  test("renders nothing when the param is absent or unknown", async () => {
    const { QueryParamBanner } = await import(
      "@/components/shared/QueryParamBanner"
    );
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <QueryParamBanner param="status" variants={variants} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();

    const { container: unknownContainer } = render(
      <MemoryRouter initialEntries={["/?status=unknown"]}>
        <QueryParamBanner param="status" variants={variants} />
      </MemoryRouter>,
    );
    expect(unknownContainer).toBeEmptyDOMElement();
  });
});

describe("app/components/shared/RouteErrorBoundary.tsx", () => {
  test("shows the message from a thrown Error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { RouteErrorBoundary } = await import(
      "@/components/shared/RouteErrorBoundary"
    );
    const Thrower = () => {
      throw new Error("route render failed");
    };
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <Thrower />,
          errorElement: <RouteErrorBoundary />,
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("route render failed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload Page" }),
    ).toBeInTheDocument();
  });

  test("shows status and statusText for a route error response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { RouteErrorBoundary } = await import(
      "@/components/shared/RouteErrorBoundary"
    );
    const router = createMemoryRouter(
      [
        {
          path: "/",
          loader: () => {
            throw new Response("missing", {
              status: 404,
              statusText: "Not Found",
            });
          },
          element: <div>never shown</div>,
          errorElement: <RouteErrorBoundary />,
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("404 Not Found")).toBeInTheDocument();
  });
});

describe("app/components/shared/SaveBar.tsx", () => {
  test("renders when changed and fires save/reset callbacks", async () => {
    const { SaveBar } = await import("@/components/shared/SaveBar");
    const onSave = vi.fn();
    const onReset = vi.fn();
    render(
      <SaveBar
        isChanged
        onSave={onSave}
        onReset={onReset}
        isSaving={false}
        message="Unsaved edits"
      />,
    );
    expect(screen.getByText("Unsaved edits")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  // Asserts the token classes rather than computed colors: jsdom does not load
  // Tailwind, so the class list is the only observable signal that the bar is
  // themed via tokens (and therefore dark-mode safe) instead of raw literals.
  test("uses design tokens rather than hardcoded colors", async () => {
    const { SaveBar } = await import("@/components/shared/SaveBar");
    const { container } = render(<SaveBar isChanged onSave={vi.fn()} />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar).toHaveClass("bg-background");
    expect(bar.className).not.toMatch(/bg-white/);

    const save = screen.getByRole("button", { name: "Save Changes" });
    expect(save.className).not.toMatch(/bg-red-|text-white/);
  });

  test("saves via keyboard shortcut and hides when unchanged", async () => {
    const { SaveBar } = await import("@/components/shared/SaveBar");
    const onSave = vi.fn();
    render(<SaveBar isChanged onSave={onSave} />);
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);

    const { container } = render(
      <SaveBar isChanged={false} onSave={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("app/components/shared/Section.tsx", () => {
  test("renders section variants and header content", async () => {
    const { Section, SectionHeader } = await import(
      "@/components/shared/Section"
    );
    render(
      <Section>
        <SectionHeader
          title="Settings"
          description="Manage things"
          actions={<button type="button">Action</button>}
          branded
        />
        <p>section body</p>
      </Section>,
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Manage things")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
    expect(screen.getByText("section body")).toBeInTheDocument();

    render(
      <Section variant="flat">
        <SectionHeader title="Flat title" compact />
      </Section>,
    );
    expect(screen.getByText("Flat title")).toBeInTheDocument();
  });
});

describe("app/components/shared/TablePagination.tsx", () => {
  test("renders summary and pages, and fires onPageChange", async () => {
    const TablePagination = (await import("@/components/shared/TablePagination"))
      .default;
    const onPageChange = vi.fn();
    render(
      <TablePagination
        currentPage={5}
        totalPages={10}
        pageSize={25}
        totalCount={250}
        showSummary
        onPageChange={onPageChange}
      />,
    );
    expect(
      screen.getByText(/Showing 101 to 125 of 250 results/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to page 5" }),
    ).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Go to page 5" }));
    expect(onPageChange).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByLabelText("Go to next page"));
    expect(onPageChange).toHaveBeenCalledWith(6);
    fireEvent.click(screen.getByLabelText("Go to previous page"));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  test("does not page past the boundaries", async () => {
    const TablePagination = (await import("@/components/shared/TablePagination"))
      .default;
    const onPageChange = vi.fn();
    render(
      <TablePagination currentPage={1} totalPages={1} onPageChange={onPageChange} />,
    );
    fireEvent.click(screen.getByLabelText("Go to previous page"));
    fireEvent.click(screen.getByLabelText("Go to next page"));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  test("disables next when there are no results", async () => {
    const TablePagination = (await import("@/components/shared/TablePagination"))
      .default;
    const onPageChange = vi.fn();
    render(
      <TablePagination
        currentPage={1}
        totalPages={0}
        pageSize={25}
        totalCount={0}
        showSummary
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByLabelText("Go to next page")).toBeDisabled();
    expect(screen.getByLabelText("Go to previous page")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Go to next page"));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});

describe("app/components/shared/theme-provider.tsx", () => {
  test("renders its children through the provider", async () => {
    const { ThemeProvider } = await import("@/components/shared/theme-provider");
    render(
      <ThemeProvider attribute="class" defaultTheme="system">
        <span>themed child</span>
      </ThemeProvider>,
    );
    expect(screen.getByText("themed child")).toBeInTheDocument();
  });
});

describe("app/components/shared/TransparentBGImage.tsx", () => {
  test("renders children over the background image layer", async () => {
    const BgImage = (await import("@/components/shared/TransparentBGImage"))
      .default;
    const { container } = render(
      <BgImage image="/Hero-1.png" opacity={0.25} className="extra">
        <span>foreground</span>
      </BgImage>,
    );
    expect(screen.getByText("foreground")).toBeInTheDocument();
    const layer = container.querySelector(
      "div.absolute",
    ) as HTMLDivElement | null;
    expect(layer).toBeTruthy();
    expect(layer?.style.backgroundImage).toContain("Hero-1.png");
    expect(layer?.style.opacity).toBe("0.25");
  });
});
