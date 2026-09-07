import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/routes/workspaces+/$id/design.loader.server", () => ({ loader: vi.fn() }));

import { Gallery } from "@/routes/workspaces+/$id/design.route";

// Roadmap E3.3: the light and dark copies of the gallery must not share ids.
describe("design gallery element ids", () => {
  test("two gallery copies render distinct checkbox and switch ids", () => {
    const { container } = render(
      <>
        <Gallery scope="light" />
        <Gallery scope="dark" />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["light-preview-checkbox", "dark-preview-checkbox", "light-preview-switch", "dark-preview-switch"]));
  });
});
