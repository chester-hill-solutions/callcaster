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

  test("hides the queue rail below the lg breakpoint (queue sheet covers mobile)", () => {
    render(
      <CallWorkbench
        call={<div>Contact and controls</div>}
        script={<div>Script questions</div>}
        queue={<div>Queue rail</div>}
      />,
    );

    const queueRail = screen.getByText("Queue rail").parentElement;
    expect(queueRail?.className).toContain("hidden");
    expect(queueRail?.className).toContain("lg:block");
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
});
