import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ApiKeyCapabilityPicker } from "@/components/workspace/ApiKeyCapabilityPicker";

describe("ApiKeyCapabilityPicker", () => {
  test("renders filters, search, and capability categories", () => {
    render(<ApiKeyCapabilityPicker />);
    expect(screen.getByText("Capability scopes")).toBeTruthy();
    expect(screen.getByText("All capabilities")).toBeTruthy();
    expect(screen.getByText("Selected capabilities")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Find capability by name or description…"),
    ).toBeTruthy();
    expect(screen.getByText("Campaigns")).toBeTruthy();
    expect(screen.getByText("Telephony")).toBeTruthy();
  });

  test("search filters visible capabilities", () => {
    render(<ApiKeyCapabilityPicker />);
    fireEvent.change(
      screen.getByPlaceholderText("Find capability by name or description…"),
      { target: { value: "invite" } },
    );
    expect(screen.getByText("members.invite")).toBeTruthy();
    expect(screen.queryByText("campaigns.read")).toBeNull();
  });

  test("checking a capability emits a hidden scopes field and selected count", () => {
    const { container } = render(<ApiKeyCapabilityPicker />);
    fireEvent.click(container.querySelector('input[data-scope-value="messages.send"]')!);
    expect(
      container.querySelector('input[type="hidden"][name="scopes"][value="messages.send"]'),
    ).toBeTruthy();
    expect(screen.getByLabelText("1 selected")).toBeTruthy();
  });
});
