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
    ChevronDown: Icon("ChevronDown"),
    X: Icon("X"),
    // shad-cc Dialog close control
    XIcon: Icon("XIcon"),
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

// Render accordion content unconditionally so tests can reach the device/mic/
// speaker controls without driving Radix's collapsible state in jsdom.
vi.mock("@/components/ui/accordion", () => ({
  Accordion: ({ children }: any) => <div>{children}</div>,
  AccordionItem: ({ children }: any) => <div>{children}</div>,
  AccordionTrigger: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  AccordionContent: ({ children }: any) => <div>{children}</div>,
}));

// Bridge Radix Select to a native <select> so fireEvent.change tests keep
// working while production uses the real ui/select primitives.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, defaultValue, onValueChange, disabled, children }: any) => (
    <select
      value={value ?? defaultValue ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <option value="">{placeholder}</option>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
}));

function baseProps(overrides: Partial<any> = {}) {
  return {
    campaign: { title: "Camp" },
    count: 10,
    completed: 3,
    mediaStream: null,
    availableMicrophones: [{ deviceId: "m1", label: "Mic 1" }] as any[],
    availableSpeakers: [{ deviceId: "s1", label: "Spk 1" }] as any[],
    selectedMicrophone: "m1",
    selectedSpeaker: "s1",
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
    verificationPhoneNumber: "",
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

  test("add-number dialog and call-in instructions wiring", async () => {
    const { CampaignHeader } = await import("@/components/call/CallScreen.Header");
    const onAddNumberCancel = vi.fn();
    const onVerifyNewNumber = vi.fn();
    const onNewPhoneNumberChange = vi.fn();
    const onAddNumberClick = vi.fn();

    // 1. Closed state: the accordion "Add Phone Number" trigger is queryable
    //    and calls onAddNumberClick. (When the Dialog is open, Radix hides the
    //    rest of the DOM from the accessibility tree, so we test the trigger
    //    while the dialog is closed first.)
    const { rerender } = render(
      <CampaignHeader
        {...baseProps({
          isAddingNumber: false,
          onAddNumberCancel,
          onVerifyNewNumber,
          onNewPhoneNumberChange,
          onAddNumberClick,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add Phone Number/i }));
    expect(onAddNumberClick).toHaveBeenCalledTimes(1);

    // 2. Open state: the dialog content (tel input, Verify, Cancel) renders via
    //    portal and is queryable through `screen`.
    rerender(
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

    const tel = screen.getByPlaceholderText("+1234567890") as HTMLInputElement;
    fireEvent.change(tel, { target: { value: "+15550001111" } });
    expect(onNewPhoneNumberChange).toHaveBeenCalledWith("+15550001111");

    fireEvent.click(screen.getByRole("button", { name: "Verify Number" }));
    expect(onVerifyNewNumber).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAddNumberCancel).toHaveBeenCalledTimes(1);

    // 3. Call-in instructions dialog branch
    rerender(
      <CampaignHeader
        {...baseProps({
          newPhoneNumber: "+15550001111",
          verificationPhoneNumber: "+15559990000",
        })}
      />,
    );
    expect(screen.getByText(/call \+15559990000 from \+15550001111/i)).toBeInTheDocument();
  });

  // Regression for #1338: settings-sheet buttons "all over the place".
  // The mute button lived in a `flex items-end` div (bottom-aligned inside
  // a taller sibling column), and the Add-Phone-Number button sat next to
  // an un-labelled Select in a raw `flex items-center` — both read as
  // stray buttons floating outside the field grid. Every button in the
  // audio-devices row must now sit inside a FormField (label above) so
  // baselines match its neighbouring Select.
  test("#1338: mute + add-phone buttons align to the field grid (FormField wrappers)", async () => {
    const { CampaignHeader } = await import("@/components/call/CallScreen.Header");

    render(<CampaignHeader {...baseProps({ settingsOnly: true })} />);

    // The old layout put the mute button directly under a bare div; the
    // fix wraps it in a FormField whose label doubles as an accessible
    // header for the control column. The label is the observable proof.
    expect(screen.getByText("Microphone control")).toBeInTheDocument();

    // Same for the calling-device row: Select + Add Phone Number now
    // share the grid with labels above, no more freeform flex row.
    expect(screen.getByText("Calling device")).toBeInTheDocument();
    expect(screen.getByText("Add device")).toBeInTheDocument();
  });

  // #1339: settings-sheet gets a Test microphone / Test speaker row so
  // operators can confirm their pick works before joining a call. The
  // row hides entirely when the layer above doesn't wire the callbacks
  // (backwards compat with older mocks).
  test("#1339: test-mic / test-speaker buttons wire callbacks and hide without them", async () => {
    const { CampaignHeader } = await import("@/components/call/CallScreen.Header");

    // Without callbacks: no row rendered.
    const { rerender } = render(<CampaignHeader {...baseProps({ settingsOnly: true })} />);
    expect(screen.queryByRole("button", { name: /Test microphone/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Test speaker/i })).toBeNull();

    const onTestSpeaker = vi.fn();
    const onToggleMicMonitor = vi.fn();

    rerender(
      <CampaignHeader
        {...baseProps({
          settingsOnly: true,
          onTestSpeaker,
          onToggleMicMonitor,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Test speaker/i }));
    expect(onTestSpeaker).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Test microphone/i }));
    expect(onToggleMicMonitor).toHaveBeenCalledTimes(1);
  });

  test("#1339: mic-level meter renders with aria-valuenow only while monitoring", async () => {
    const { CampaignHeader } = await import("@/components/call/CallScreen.Header");
    const onToggleMicMonitor = vi.fn();

    const { rerender } = render(
      <CampaignHeader
        {...baseProps({
          settingsOnly: true,
          onToggleMicMonitor,
          isMicMonitoring: false,
          micLevel: 0.42,
        })}
      />,
    );
    // Not monitoring → no meter, and the meter's absence is what the
    // aria-pressed=false button state communicates to screen readers.
    expect(screen.queryByRole("meter")).toBeNull();
    const btn = screen.getByRole("button", { name: /Test microphone/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");

    rerender(
      <CampaignHeader
        {...baseProps({
          settingsOnly: true,
          onToggleMicMonitor,
          isMicMonitoring: true,
          micLevel: 0.42,
        })}
      />,
    );
    // Monitoring → meter appears, level scaled to percent, button flips
    // to "Stop test" with aria-pressed=true.
    const meter = screen.getByRole("meter", { name: /Microphone input level/i });
    expect(meter).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByRole("button", { name: /Stop test/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("mic-level-fill").getAttribute("style")).toContain("width: 42%");
  });

  test("#1339: test-speaker button disables while a tone is playing and error surfaces", async () => {
    const { CampaignHeader } = await import("@/components/call/CallScreen.Header");
    const onTestSpeaker = vi.fn();

    const { rerender } = render(
      <CampaignHeader
        {...baseProps({
          settingsOnly: true,
          onTestSpeaker,
          isSpeakerPlaying: true,
        })}
      />,
    );
    const btn = screen.getByRole("button", { name: /Playing tone/i });
    expect(btn).toBeDisabled();

    rerender(
      <CampaignHeader
        {...baseProps({
          settingsOnly: true,
          onTestSpeaker,
          audioTestError: "Could not play the test tone.",
        })}
      />,
    );
    expect(screen.getByTestId("audio-test-error")).toHaveTextContent(
      "Could not play the test tone.",
    );
  });
});

