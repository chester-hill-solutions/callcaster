import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    logger: { debug: vi.fn() },
  };
});

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

vi.mock("lucide-react", () => {
  const Icon = (name: string) => {
    const MockIcon = (props: any) => <span data-icon={name} {...props} />;
    MockIcon.displayName = name;
    return MockIcon;
  };
  return {
    Mic: Icon("Mic"),
    MicOff: Icon("MicOff"),
    PhoneOff: Icon("PhoneOff"),
    AlertTriangle: Icon("AlertTriangle"),
    Headphones: Icon("Headphones"),
    Phone: Icon("Phone"),
    Monitor: Icon("Monitor"),
    Plus: Icon("Plus"),
    CheckCircleIcon: Icon("CheckCircleIcon"),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild, children, ...props }: any) => {
    if (asChild) return <>{children}</>;
    return (
      <button type={props.type ?? "button"} {...props}>
        {children}
      </button>
    );
  },
}));

function baseProps(overrides: Partial<any> = {}) {
  return {
    campaign: { title: "Camp" },
    count: 10,
    completed: 3,
    mediaStream: null,
    availableMicrophones: [{ deviceId: "m1", label: "Mic 1" }] as any[],
    availableSpeakers: [{ deviceId: "s1", label: "Spk 1" }] as any[],
    onLeaveCampaign: vi.fn(),
    onReportError: vi.fn(),
    handleMicrophoneChange: vi.fn(),
    handleSpeakerChange: vi.fn(),
    handleMuteMicrophone: vi.fn(),
    isMicrophoneMuted: false,
    availableCredits: 99,
    creditState: "GOOD",
    hasAccess: true,
    phoneStatus: "connected",
    selectedDevice: "computer",
    onDeviceSelect: vi.fn(),
    verifiedNumbers: ["+15551234567"],
    isAddingNumber: false,
    onAddNumberClick: vi.fn(),
    onAddNumberCancel: vi.fn(),
    newPhoneNumber: "",
    onNewPhoneNumberChange: vi.fn(),
    onVerifyNewNumber: vi.fn(),
    pin: "",
    ...overrides,
  };
}

describe("app/components/call/CallScreen.Header.tsx", () => {
  test("renders credits badge states, remaining count, and basic actions", async () => {
    const { CampaignHeader } = await import("@/components/call/CallScreen.Header");
    const onLeaveCampaign = vi.fn();
    const onReportError = vi.fn();

    const { rerender } = render(
      <CampaignHeader
        {...baseProps({
          onLeaveCampaign,
          onReportError,
          hasAccess: true,
          availableCredits: 5,
          creditState: "GOOD",
        })}
      />,
    );

    expect(screen.getByText("7 of 10 remaining")).toBeInTheDocument();
    expect(screen.getByText("5 credits remaining")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();

    rerender(
      <CampaignHeader
        {...baseProps({
          onLeaveCampaign,
          onReportError,
          hasAccess: true,
          availableCredits: 2,
          creditState: "WARNING",
        })}
      />,
    );
    expect(screen.getByText("Running Low")).toBeInTheDocument();

    rerender(
      <CampaignHeader
        {...baseProps({
          onLeaveCampaign,
          onReportError,
          hasAccess: true,
          availableCredits: 0,
          creditState: "BAD",
        })}
      />,
    );
    expect(screen.getByText("Critical")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Leave Campaign/i }));
    fireEvent.click(screen.getByRole("button", { name: /Report Issue/i }));
    expect(onLeaveCampaign).toHaveBeenCalledTimes(1);
    expect(onReportError).toHaveBeenCalledTimes(1);

    // hasAccess=false hides credits section entirely
    rerender(<CampaignHeader {...baseProps({ hasAccess: false })} />);
    expect(screen.queryByText(/credits remaining/i)).toBeNull();
  });

  test("device select toggles icon and shows connecting status", async () => {
    const { CampaignHeader } = await import("@/components/call/CallScreen.Header");
    const onDeviceSelect = vi.fn();

    const { rerender, container } = render(
      <CampaignHeader
        {...baseProps({
          phoneStatus: "connecting",
          selectedDevice: "+15551234567",
          onDeviceSelect,
          verifiedNumbers: ["+15551234567", "+15550001111"],
        })}
      />,
    );

    expect(screen.getByText("Connecting...")).toBeInTheDocument();
    expect(screen.getByText("+15550001111")).toBeInTheDocument();
    expect(screen.getByText("+15551234567")).toBeInTheDocument();
    expect(screen.getByText("Computer Audio")).toBeInTheDocument();
    expect(screen.getByText("Add Phone Number")).toBeInTheDocument();
    expect(screen.getByText("Camp")).toBeInTheDocument();

    // selectedDevice != computer -> Phone icon
    expect(container.querySelector('[data-icon="Phone"]')).not.toBeNull();

    const deviceSelect = screen.getByText("Computer Audio").closest("select") as HTMLSelectElement;
    fireEvent.change(deviceSelect, { target: { value: "computer" } });
    expect(onDeviceSelect).toHaveBeenCalledWith("computer");

    rerender(<CampaignHeader {...baseProps({ selectedDevice: "computer" })} />);
    expect(container.querySelector('[data-icon="Monitor"]')).not.toBeNull();
  });

  test("mute button text switches and calls handler", async () => {
    const { CampaignHeader } = await import("@/components/call/CallScreen.Header");
    const handleMuteMicrophone = vi.fn();

    const { rerender } = render(
      <CampaignHeader {...baseProps({ isMicrophoneMuted: false, handleMuteMicrophone })} />,
    );
    expect(screen.getByText("Mute Microphone")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mute Microphone/i }));
    expect(handleMuteMicrophone).toHaveBeenCalledTimes(1);

    rerender(<CampaignHeader {...baseProps({ isMicrophoneMuted: true, handleMuteMicrophone })} />);
    expect(screen.getByText("Unmute Microphone")).toBeInTheDocument();
  });

  test("add-number dialog and PIN overlay wiring", async () => {
    const { CampaignHeader } = await import("@/components/call/CallScreen.Header");
    const onAddNumberCancel = vi.fn();
    const onVerifyNewNumber = vi.fn();
    const onNewPhoneNumberChange = vi.fn();
    const onAddNumberClick = vi.fn();

    const { rerender } = render(
      <CampaignHeader
        {...baseProps({
          isAddingNumber: true,
          newPhoneNumber: "+1",
          onAddNumberCancel,
          onVerifyNewNumber,
          onNewPhoneNumberChange,
          onAddNumberClick,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add Phone Number/i }));
    expect(onAddNumberClick).toHaveBeenCalledTimes(1);

    const tel = screen.getByPlaceholderText("+1234567890") as HTMLInputElement;
    fireEvent.change(tel, { target: { value: "+15550001111" } });
    expect(onNewPhoneNumberChange).toHaveBeenCalledWith("+15550001111");

    fireEvent.click(screen.getByRole("button", { name: "Verify Number" }));
    expect(onVerifyNewNumber).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAddNumberCancel).toHaveBeenCalledTimes(1);

    // PIN overlay branch
    rerender(<CampaignHeader {...baseProps({ pin: "1234" })} />);
    expect(screen.getByText(/enter the PIN: 1234/i)).toBeInTheDocument();
  });
});

