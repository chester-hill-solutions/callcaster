import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

// The route re-exports its loader/action from server-only modules; the
// component under test never runs them, so stub them out to keep the DB out of
// jsdom.
vi.mock("../../app/routes/workspaces+/$id/audios/new.loader.server", () => ({
  loader: vi.fn(),
}));
vi.mock("../../app/routes/workspaces+/$id/audios/new.action.server", () => ({
  action: vi.fn(),
}));

import Media from "../../app/routes/workspaces+/$id/audios/new.route";

function renderPage() {
  const router = createMemoryRouter(
    [{ path: "/workspaces/w1/audios/new", Component: Media }],
    { initialEntries: ["/workspaces/w1/audios/new"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Add Audio upload zone (#1346)", () => {
  test("clicking the zone activates the hidden file input", () => {
    const { container } = renderPage();

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    // The zone must be a real label for the input, so "Upload" resolves to the
    // picker and clicking anywhere in the zone opens it.
    expect(screen.getByLabelText("Upload")).toBe(input);

    const activated = vi.fn();
    input!.addEventListener("click", activated);
    fireEvent.click(input!.closest("label")!);
    expect(activated).toHaveBeenCalledTimes(1);
  });

  test("choosing a file shows its name in the zone", () => {
    const { container } = renderPage();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    // jsdom rejects value assignment on file inputs through the IDL setter,
    // but the zone only reads e.target.value, so define the fakepath the
    // browser would report and fire the change.
    Object.defineProperty(input, "value", {
      value: "C:\\fakepath\\greeting.mp3",
      configurable: true,
    });
    fireEvent.change(input);

    expect(screen.getByText("greeting.mp3")).toBeInTheDocument();
  });
});