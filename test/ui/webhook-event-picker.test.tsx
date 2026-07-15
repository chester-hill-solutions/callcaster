import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { WebhookEventPicker } from "@/components/workspace/WebhookEventPicker";

describe("WebhookEventPicker", () => {
  test("renders event filters, search, and grouped categories", () => {
    render(
      <WebhookEventPicker selected={new Set()} onSelectedChange={() => undefined} />,
    );
    expect(screen.getByText("Events")).toBeTruthy();
    expect(screen.getByText("All events")).toBeTruthy();
    expect(screen.getByText("Selected events")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Find event by name or description…"),
    ).toBeTruthy();
    expect(screen.getByText("Inbound call")).toBeTruthy();
    expect(screen.getByText("Voicemail")).toBeTruthy();
  });

  test("toggling an event notifies the parent", () => {
    const onSelectedChange = vi.fn();
    const { container } = render(
      <WebhookEventPicker selected={new Set()} onSelectedChange={onSelectedChange} />,
    );
    fireEvent.click(
      container.querySelector('input[data-webhook-event="contacts_updated"]') ??
        container.querySelector('input[data-webhook-event="inbound_call:INSERT"]')!,
    );
    expect(onSelectedChange).toHaveBeenCalled();
    const next = onSelectedChange.mock.calls[0][0] as Set<string>;
    expect(next.has("inbound_call:INSERT")).toBe(true);
  });

  test("select all marks every visible event", () => {
    const onSelectedChange = vi.fn();
    render(
      <WebhookEventPicker selected={new Set()} onSelectedChange={onSelectedChange} />,
    );
    fireEvent.click(screen.getByLabelText("Select all visible events"));
    expect(onSelectedChange).toHaveBeenCalled();
    const next = onSelectedChange.mock.calls[0][0] as Set<string>;
    expect(next.size).toBe(9);
  });

  test("shows Test button for selected INSERT events", () => {
    const onTestEvent = vi.fn();
    render(
      <WebhookEventPicker
        selected={new Set(["inbound_call:INSERT"])}
        onSelectedChange={() => undefined}
        onTestEvent={onTestEvent}
        canTest
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(onTestEvent).toHaveBeenCalledWith(
      expect.objectContaining({ value: "inbound_call:INSERT" }),
    );
  });

  test("explains why a selected event cannot be tested", () => {
    render(
      <WebhookEventPicker
        selected={new Set(["inbound_call:INSERT"])}
        onSelectedChange={() => undefined}
        onTestEvent={() => undefined}
        canTest={false}
        testDisabledReason="Enter a destination URL to test this webhook."
      />,
    );

    expect(screen.getByRole("button", { name: "Test" })).toBeDisabled();
    expect(
      screen.getByText("Enter a destination URL to test this webhook."),
    ).toBeVisible();
  });
});
