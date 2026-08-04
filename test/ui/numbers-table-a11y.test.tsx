import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Regression tests for audit-F's settings-numbers button-name/select-name
// axe violations: the release ("x"), edit (pencil), incoming-call-handling
// select, and voicemail-message select were all icon-only or unlabeled.

const makeNumber = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    phone_number: "+15551234567",
    friendly_name: "E2E Primary",
    type: "rented",
    workspace: "ws-1",
    capabilities: {},
    handset_enabled: false,
    inbound_ring_count: 4,
    inbound_script_id: null,
    inbound_queue_id: null,
    inbound_action: "",
    inbound_audio: "",
    ...overrides,
  }) as never;

const noop = vi.fn();

describe("app/components/phone-numbers/NumbersTable.tsx", () => {
  test("release, edit, and per-row selects all have accessible names", async () => {
    const { NumbersTable } = await import(
      "@/components/phone-numbers/NumbersTable"
    );
    render(
      <MemoryRouter>
        <NumbersTable
          phoneNumbers={[makeNumber()]}
          users={[]}
          mediaNames={[{ id: 1, name: "welcome" }]}
          queues={[]}
          scripts={[]}
          onIncomingActivityChange={noop}
          onIncomingVoiceMessageChange={noop}
          onCallerIdChange={noop}
          onHandsetChange={noop}
          onInboundRingCountChange={noop}
          onInboundQueueChange={noop}
          onInboundScriptChange={noop}
          onNumberRemoval={noop}
          isBusy={false}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: "Release +15551234567" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Edit caller ID for +15551234567",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: "Incoming call handling for +15551234567",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: "Voicemail message for +15551234567",
      }),
    ).toBeInTheDocument();
  });
});
