import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

describe("app/components/call/CallScreen.DTMFPhone.tsx", () => {
  test("renders display states and formats duration as m:ss", async () => {
    const { PhoneKeypad } = await import("@/components/call/CallScreen.DTMFPhone");

    const base = {
      onKeyPress: vi.fn(),
      displayColor: "#00ff00",
      callDuration: 61,
      displayState: "dialing",
    };

    const cases: Array<{ displayState: string; expected: string }> = [
      { displayState: "failed", expected: "Call Failed" },
      { displayState: "dialing", expected: "Dialing... 1:01" },
      { displayState: "connected", expected: "Connected 1:01" },
      { displayState: "no-answer", expected: "No Answer" },
      { displayState: "voicemail", expected: "Voicemail Left" },
      { displayState: "completed", expected: "Call Completed" },
      { displayState: "idle", expected: "Pending" },
    ];

    for (const c of cases) {
      const { unmount } = render(<PhoneKeypad {...base} displayState={c.displayState} />);
      expect(screen.getByText(c.expected)).toBeInTheDocument();
      unmount();
    }
  });

  test("clicking keypad buttons calls onKeyPress with string values", async () => {
    const { PhoneKeypad } = await import("@/components/call/CallScreen.DTMFPhone");
    const onKeyPress = vi.fn();

    render(
      <PhoneKeypad
        onKeyPress={onKeyPress}
        displayState="idle"
        displayColor="#000"
        callDuration={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "*" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    fireEvent.click(screen.getByRole("button", { name: "#" }));

    expect(onKeyPress).toHaveBeenCalledWith("*");
    expect(onKeyPress).toHaveBeenCalledWith("0");
    expect(onKeyPress).toHaveBeenCalledWith("#");
  });
});

