import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SmokeRouter, noop } from "./_helpers/component-smoke";

describe("app/components/phone-numbers/NumberPurchase.SuccessDialog.tsx", () => {
  test("renders nothing when phoneNumber is null", async () => {
    const { NumberPurchaseSuccessDialog } = await import(
      "@/components/phone-numbers/NumberPurchase.SuccessDialog"
    );
    render(
      <SmokeRouter>
        <NumberPurchaseSuccessDialog
          phoneNumber={null}
          onClose={noop}
          workspaceId="ws-1"
        />
      </SmokeRouter>,
    );
    expect(screen.queryByText(/Your number is live/i)).not.toBeInTheDocument();
  });

  test("shows the success moment with a tel link, copyable number, and Voicemails link", async () => {
    const { NumberPurchaseSuccessDialog } = await import(
      "@/components/phone-numbers/NumberPurchase.SuccessDialog"
    );
    const onClose = vi.fn();
    render(
      <SmokeRouter>
        <NumberPurchaseSuccessDialog
          phoneNumber="+15551234567"
          onClose={onClose}
          workspaceId="ws-1"
        />
      </SmokeRouter>,
    );

    expect(screen.getByText(/Your number is live/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Try it now: call \+15551234567 from your phone/i),
    ).toBeInTheDocument();

    const telLink = screen.getByRole("link", { name: "+15551234567" });
    expect(telLink).toHaveAttribute("href", "tel:+15551234567");

    const voicemailsLink = screen.getByRole("link", { name: "Go to Voicemails" });
    expect(voicemailsLink).toHaveAttribute("href", "/workspaces/ws-1/voicemails");

    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
});
