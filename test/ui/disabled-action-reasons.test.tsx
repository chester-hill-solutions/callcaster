import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { OutboundDialer } from "@/components/calls/OutboundDialer";
import { NumbersTable } from "@/components/phone-numbers/NumbersTable";

describe("disabled primary action reasons", () => {
  test("explains why outbound dialing is unavailable", () => {
    render(
      <OutboundDialer
        value=""
        error={null}
        disabled
        disabledReason="Set your status to Available to dial out."
        onChange={vi.fn()}
        onDial={vi.fn()}
        onClearError={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Dial" })).toBeDisabled();
    expect(
      screen.getByText("Set your status to Available to dial out."),
    ).toBeVisible();
  });

  test("explains why call forwarding is unavailable", () => {
    render(
      <NumbersTable
        phoneNumbers={[
          {
            id: 1,
            type: "rented",
            phone_number: "+15551234567",
            friendly_name: "Main line",
          } as never,
        ]}
        users={[]}
        mediaNames={[]}
        onIncomingActivityChange={vi.fn()}
        onIncomingVoiceMessageChange={vi.fn()}
        onCallerIdChange={vi.fn()}
        onNumberRemoval={vi.fn()}
        isBusy={false}
      />,
    );

    expect(
      screen.getByText("Verify a caller ID before enabling call forwarding."),
    ).toBeVisible();
  });
});
