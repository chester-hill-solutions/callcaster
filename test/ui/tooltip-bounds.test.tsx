import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  TOOLTIP_DEFAULT_MAX_HEIGHT,
  TOOLTIP_DEFAULT_MAX_WIDTH,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function renderOpenTooltip(contentProps: Record<string, unknown> = {}) {
  return render(
    createElement(
      TooltipProvider,
      null,
      createElement(
        Tooltip,
        { open: true },
        createElement(TooltipTrigger, { asChild: true }, createElement("button", { type: "button" }, "info")),
        createElement(TooltipContent, contentProps, "A long explanation that must wrap and scroll instead of spanning the page."),
      ),
    ),
  );
}

describe("TooltipContent bounds (#1148)", () => {
  test("wraps at a readable width and scrolls past a modest height by default", () => {
    renderOpenTooltip();
    const bubble = screen.getAllByText(/A long explanation/).at(-1)?.closest("[data-state]");
    expect(bubble).not.toBeNull();
    const className = bubble?.className ?? "";
    expect(className).toContain(TOOLTIP_DEFAULT_MAX_WIDTH);
    expect(className).toContain(TOOLTIP_DEFAULT_MAX_HEIGHT);
    expect(className).toContain("overflow-y-auto");
    expect(className).toContain("break-words");
    expect(className).not.toContain("overflow-hidden");
  });

  test("callers can widen or unbound a specific tooltip", () => {
    renderOpenTooltip({ maxWidthClassName: "max-w-md", maxHeightClassName: "max-h-none" });
    const bubble = screen.getAllByText(/A long explanation/).at(-1)?.closest("[data-state]");
    const className = bubble?.className ?? "";
    expect(className).toContain("max-w-md");
    expect(className).toContain("max-h-none");
    expect(className).not.toContain(TOOLTIP_DEFAULT_MAX_WIDTH);
  });
});
