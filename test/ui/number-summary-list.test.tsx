import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { NumberSummaryList } from "@/components/phone-numbers/NumberSummaryList";
import type { WorkspaceNumbers } from "@/lib/types";
import type { InboundRoutingPresetId } from "../../shared/inbound-routing-presets";

const noop = vi.fn();

function makeNumber(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    phone_number: "+14165550100",
    friendly_name: "Main line",
    type: "rented",
    workspace: "ws-1",
    capabilities: { verification_status: "success" },
    handset_enabled: false,
    inbound_ring_count: 3,
    inbound_script_id: null,
    inbound_queue_id: 7,
    inbound_action: null,
    inbound_audio: null,
    ...overrides,
  } as never;
}

function renderList(
  number = makeNumber(),
  onApplyPreset = vi.fn(),
  options: {
    phoneNumbers?: WorkspaceNumbers[];
    presetOrder?: readonly InboundRoutingPresetId[];
    verifiedCallerIds?: WorkspaceNumbers[];
  } = {},
) {
  render(
    <MemoryRouter>
      <NumberSummaryList
        phoneNumbers={options.phoneNumbers ?? [number]}
        presetOrder={options.presetOrder}
        verifiedCallerIds={options.verifiedCallerIds}
        users={[]}
        mediaNames={[]}
        queues={[{ id: 7, name: "Support" }]}
        scripts={[{ id: 9, name: "Welcome menu" }]}
        isBusy={false}
        onApplyPreset={onApplyPreset}
        onIncomingActivityChange={noop}
        onIncomingVoiceMessageChange={noop}
        onCallerIdChange={noop}
        onHandsetChange={noop}
        onInboundRingCountChange={noop}
        onInboundQueueChange={noop}
        onInboundScriptChange={noop}
        onNumberRemoval={noop}
      />
    </MemoryRouter>,
  );
  return onApplyPreset;
}

describe("NumberSummaryList", () => {
  test("shows inferred preset and effective route in a compact card", () => {
    renderList();

    expect(screen.getAllByText("Queue").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Support")).toHaveLength(2);
    expect(
      screen.getByRole("combobox", { name: "Routing preset" }),
    ).toBeInTheDocument();
  });

  test("explains conflicting legacy routing", () => {
    renderList(
      makeNumber({
        handset_enabled: true,
        inbound_queue_id: 7,
      }),
    );

    expect(screen.getByText("Custom routing")).toBeInTheDocument();
    expect(
      screen.getByText(/Multiple routing destinations are configured/),
    ).toBeInTheDocument();
  });

  test("submits one preset action and exposes advanced controls", () => {
    const onApplyPreset = renderList();
    fireEvent.change(screen.getByRole("combobox", { name: "Routing preset" }), {
      target: { value: "automated_menu" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Automated menu script" }),
      { target: { value: "9" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Apply routing preset for +14165550100",
      }),
    );

    expect(onApplyPreset).toHaveBeenCalledTimes(1);
    expect(onApplyPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        formName: "apply-routing-preset",
        numberId: "1",
        presetId: "automated_menu",
        scriptId: "9",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Advanced routing for +14165550100",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Advanced number settings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Ring count for +14165550100" }),
    ).toBeInTheDocument();
  });

  test("keeps caller ID rows outbound-only", () => {
    renderList(makeNumber({ type: "caller_id" }));

    expect(screen.getByText("Outbound only")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Apply routing preset for +14165550100",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit +14165550100" }),
    ).toBeInTheDocument();
  });

  test("uses the first goal-ranked preset for custom routing", () => {
    renderList(
      makeNumber({ handset_enabled: true, inbound_queue_id: 7 }),
      vi.fn(),
      {
        presetOrder: [
          "voicemail",
          "agent",
          "queue",
          "automated_menu",
          "forward",
          "webhook_only",
        ],
      },
    );

    expect(screen.getByRole("combobox", { name: "Routing preset" })).toHaveValue(
      "voicemail",
    );
  });

  test("offers forwarding only to verified caller IDs", () => {
    const verifiedCallerId = makeNumber({
      id: 2,
      type: "caller_id",
      phone_number: "+14165550199",
      friendly_name: "Reception",
    });
    renderList(makeNumber(), vi.fn(), {
      verifiedCallerIds: [verifiedCallerId],
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Routing preset" }), {
      target: { value: "forward" },
    });

    expect(
      screen.getByRole("combobox", { name: "Forwarding phone number" }),
    ).toHaveTextContent("Reception");
    expect(
      screen.getByRole("option", { name: "Reception" }),
    ).toHaveValue("+14165550199");
  });

  test("explains when call forwarding is unavailable", () => {
    renderList();

    expect(
      screen.getByRole("option", {
        name: "Forward call — verify caller ID first",
      }),
    ).toBeDisabled();
  });

  test("scopes Advanced to the selected number", () => {
    const secondNumber = makeNumber({
      id: 2,
      phone_number: "+14165550101",
      friendly_name: "Second line",
    });
    renderList(makeNumber(), vi.fn(), {
      phoneNumbers: [makeNumber(), secondNumber],
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Advanced routing for +14165550100",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Release +14165550100" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Release +14165550101" }),
    ).not.toBeInTheDocument();
  });
});
