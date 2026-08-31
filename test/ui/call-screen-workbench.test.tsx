import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CallWorkbench } from "@/components/call/CallScreen.Workbench";

describe("CallScreen.Workbench", () => {
  test("keeps the operator loop in task order (action first, then script, queue rail last in DOM)", () => {
    render(
      <CallWorkbench
        incoming={<div>Incoming call</div>}
        call={<div>Contact and controls</div>}
        household={<div>Household context</div>}
        script={<div>Script questions</div>}
        queue={<div>Queue rail</div>}
      />,
    );

    const workspace = screen.getByRole("region", { name: "Call workspace" });
    expect(workspace).toHaveTextContent(
      "Incoming callContact and controlsHousehold contextScript questionsQueue rail",
    );
  });

  test("hides the queue rail below the xl breakpoint (queue sheet covers mobile)", () => {
    render(
      <CallWorkbench
        call={<div>Contact and controls</div>}
        script={<div>Script questions</div>}
        queue={<div>Queue rail</div>}
      />,
    );

    const queueRail = screen.getByText("Queue rail").parentElement;
    expect(queueRail?.className).toContain("hidden");
    expect(queueRail?.className).toContain("xl:block");
  });

  test("omits the incoming and queue slots when not provided", () => {
    render(
      <CallWorkbench
        call={<div>Contact and controls</div>}
        script={<div>Script questions</div>}
      />,
    );

    const workspace = screen.getByRole("region", { name: "Call workspace" });
    expect(workspace).toHaveTextContent(
      "Contact and controlsScript questions",
    );
  });

  // Regression for #1343: the xl grid used to hard-code column widths
  // (340px + 420px min + 380px), which added up to ~1172px and
  // horizontally scrolled a 13" MacBook (available grid width is
  // ~916px). Every column must be a `minmax(min, ideal)` so they can
  // shrink under 1280px viewports.
  test("#1343: xl grid columns use minmax so they compress on small desktops", () => {
    render(
      <CallWorkbench
        call={<div>Contact and controls</div>}
        script={<div>Script questions</div>}
        queue={<div>Queue rail</div>}
      />,
    );

    const workspace = screen.getByRole("region", { name: "Call workspace" });
    // Every xl column entry must be a minmax(...) — a raw pixel width
    // reintroduces the horizontal-scroll regression.
    expect(workspace.className).toMatch(
      /xl:grid-cols-\[minmax\([^)]+\)_minmax\([^)]+\)_minmax\([^)]+\)\]/,
    );
  });
});
