import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { OperatorColumn } from "@/components/call/CallScreen.OperatorColumn";

describe("CallScreen.OperatorColumn", () => {
  test("keeps the operator loop in task order", () => {
    render(
      <OperatorColumn
        incoming={<div>Incoming call</div>}
        call={<div>Contact and controls</div>}
        household={<div>Household context</div>}
        script={<div>Script questions</div>}
        disposition={<div>Disposition and next contact</div>}
      />,
    );

    const workspace = screen.getByRole("region", { name: "Call workspace" });
    expect(workspace).toHaveTextContent(
      "Incoming callContact and controlsHousehold contextScript questionsDisposition and next contact",
    );
  });
});
