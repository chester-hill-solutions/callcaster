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

  test("capability descriptions cover data-plane resources", () => {
    render(<ApiKeyCapabilityPicker />);
    expect(
      screen.getByText(/contacts, audiences, scripts, surveys, conversations/i),
    ).toBeTruthy();
    expect(screen.getByText(/Dispatch campaign SMS batches/i)).toBeTruthy();
    expect(screen.getByText(/direct chat SMS/i)).toBeTruthy();
  });

  test("checking a capability emits a hidden scopes field and selected count", () => {
    const { container } = render(<ApiKeyCapabilityPicker />);
    fireEvent.click(container.querySelector('input[data-scope-value="messages.send"]')!);
    expect(
      container.querySelector('input[type="hidden"][name="scopes"][value="messages.send"]'),
    ).toBeTruthy();
    expect(screen.getByLabelText("1 selected")).toBeTruthy();
  });

  /**
   * Issue #1264 — the picker mirrors the server-side scope cap so a minter is
   * never offered a capability the mint would refuse. `audit.read` is
   * owner-only, so an admin's picker must not carry it.
   */
  describe("grantableScopes cap", () => {
    const ADMIN_SCOPES = [
      "campaigns.read",
      "campaigns.write",
      "campaigns.dispatch",
      "calls.start",
      "calls.control",
      "messages.send",
      "members.invite",
    ] as const;

    test("omits capabilities outside the grantable set", () => {
      const { container } = render(
        <ApiKeyCapabilityPicker grantableScopes={ADMIN_SCOPES} />,
      );
      expect(
        container.querySelector('input[data-scope-value="members.invite"]'),
      ).toBeTruthy();
      expect(
        container.querySelector('input[data-scope-value="audit.read"]'),
      ).toBeNull();
    });

    test("a capped-out capability stays hidden from search", () => {
      const { container } = render(
        <ApiKeyCapabilityPicker grantableScopes={ADMIN_SCOPES} />,
      );
      fireEvent.change(
        screen.getByPlaceholderText("Find capability by name or description…"),
        { target: { value: "audit" } },
      );
      expect(
        container.querySelector('input[data-scope-value="audit.read"]'),
      ).toBeNull();
    });

    test("select-all cannot sweep in a capped-out capability", () => {
      const { container } = render(
        <ApiKeyCapabilityPicker grantableScopes={ADMIN_SCOPES} />,
      );
      fireEvent.click(screen.getByLabelText("Select all visible capabilities"));
      expect(
        container.querySelector(
          'input[type="hidden"][name="scopes"][value="audit.read"]',
        ),
      ).toBeNull();
      expect(
        container.querySelectorAll('input[type="hidden"][name="scopes"]').length,
      ).toBe(ADMIN_SCOPES.length);
    });

    test("omitting the prop offers the full catalogue", () => {
      const { container } = render(<ApiKeyCapabilityPicker />);
      expect(
        container.querySelector('input[data-scope-value="audit.read"]'),
      ).toBeTruthy();
    });
  });
});
