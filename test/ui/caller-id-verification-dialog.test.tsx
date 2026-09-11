import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { CallerIdVerificationDialog } from "@/components/phone-numbers/CallerIdVerificationDialog";

const baseRequest = {
  accountSid: "AC1",
  callSid: "CA1",
  friendlyName: "Cell",
  phoneNumber: "+15555550100",
  validationCode: "123456",
};

describe("CallerIdVerificationDialog", () => {
  test("shows the pending state with the confirmation token", () => {
    render(
      <CallerIdVerificationDialog
        isOpen
        onOpenChange={() => undefined}
        validationRequest={baseRequest}
        status="pending"
      />,
    );
    expect(screen.getByText("Verification pending")).toBeTruthy();
    expect(screen.getByText("Confirmation token")).toBeTruthy();
    expect(screen.getByText("123456")).toBeTruthy();
    expect(screen.getByText(/verification call at \+15555550100/)).toBeTruthy();
  });

  test("shows a verified outcome once the callback flips the status", () => {
    render(
      <CallerIdVerificationDialog
        isOpen
        onOpenChange={() => undefined}
        validationRequest={baseRequest}
        status="success"
      />,
    );
    expect(screen.getByText("Number verified")).toBeTruthy();
    expect(screen.getByText("✓ Verified")).toBeTruthy();
  });

  test("shows a failed outcome when verification fails", () => {
    render(
      <CallerIdVerificationDialog
        isOpen
        onOpenChange={() => undefined}
        validationRequest={baseRequest}
        status="failed"
      />,
    );
    expect(screen.getByText("Verification failed")).toBeTruthy();
    expect(screen.getByText("✕ Not verified")).toBeTruthy();
  });
});