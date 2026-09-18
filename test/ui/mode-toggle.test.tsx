import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

// #1750: the theme toggle's aria-label/title must be server-stable. The
// resolved theme comes from localStorage/prefers-color-scheme, which SSR
// cannot know — emitting "Theme mode: light..." on the first pass makes the
// server HTML (auto/system) differ from the hydrated one and re-fires React
// #418. The label follows the icon: neutral until mounted, resolved after.

const useThemeMock = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: (...args: unknown[]) => useThemeMock(...args),
}));

import { ModeToggle } from "@/components/shared/mode-toggle";

function seedTheme(based: { theme: string; resolvedTheme: string }) {
  useThemeMock.mockReturnValue({
    setTheme: vi.fn(),
    ...based,
  });
}

describe("ModeToggle hydration-stable label (#1750)", () => {
  beforeEach(() => {
    useThemeMock.mockReset();
  });

  test("renders the neutral label in SSR (no effects run)", () => {
    seedTheme({ theme: "system", resolvedTheme: "dark" });
    // renderToStaticMarkup does not mount, so `mounted` stays false — this is
    // the exact markup the server sends before React hydrates.
    const html = renderToStaticMarkup(<ModeToggle />);

    expect(html).toContain('aria-label="Toggle theme."');
    expect(html).not.toContain("Theme mode:");
  });

  test("reveals the resolved label after hydration mount", async () => {
    seedTheme({ theme: "light", resolvedTheme: "light" });
    render(<ModeToggle />);

    const button = (await screen.findAllByRole("button"))[0];
    await vi.waitFor(() => {
      expect(button?.getAttribute("aria-label")).toBe(
        "Toggle theme. Theme mode: light. Click to switch to dark mode.",
      );
    });
  });
});