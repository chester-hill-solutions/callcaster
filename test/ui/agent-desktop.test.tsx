import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild, children, ...props }: any) => {
    if (asChild) return <>{children}</>;
    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <select
      value={value ?? ""}
      disabled={disabled}
      aria-label="status-reason"
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

vi.mock("react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={typeof to === "string" ? to : "#"} {...props}>
      {children}
    </a>
  ),
  useLoaderData: () => ({
    handsetNumber: "+15551234567",
    clientIdentity: "identity",
    workspaceId: "w1",
    token: "token",
    tokenError: null,
    agentStatus: {
      status: "available",
      status_started_at: "2026-07-15T12:00:00.000Z",
      status_reason: null,
    },
    userId: "u1",
  }),
  useNavigate: () => vi.fn(),
  useFetcher: () => ({ submit: vi.fn() }),
  useOutletContext: () => ({ env: { BASE_URL: "http://localhost" } }),
}));

vi.mock("@/hooks/handset/useEndSessionOnUnmount", () => ({
  useEndSessionOnUnmount: () => undefined,
}));

vi.mock("@/hooks/call/useSoftphoneController", () => ({
  useSoftphoneController: () => ({
    connection: { device: null },
    callHandling: {
      activeCall: null,
      isMicMuted: false,
      setMicMuted: vi.fn(),
    },
    handleEndSession: vi.fn(),
  }),
}));

vi.mock("@/hooks/call/useSoftphoneAudioDevices", () => ({
  useSoftphoneAudioDevices: () => ({
    devices: [],
    selectedMicId: "",
    selectedSpeakerId: "",
    setSelectedMicId: vi.fn(),
    setSelectedSpeakerId: vi.fn(),
    speakerMuted: false,
    toggleSpeakerMute: vi.fn(),
  }),
}));

vi.mock("@/components/calls/SoftphonePanel", () => ({
  SoftphonePanel: ({ headerExtra, waitingContent }: any) => (
    <div>
      {headerExtra}
      {waitingContent}
    </div>
  ),
}));

const setStatus = vi.fn(async () => true);

vi.mock("@/hooks/agent/useAgentStatus", () => ({
  useAgentStatus: () => ({
    agentStatus: null,
    setStatus,
    refreshStatus: vi.fn(),
    loading: false,
    error: null,
    onlineAgents: [],
  }),
}));

describe("AgentDesktop status picker", () => {
  test("submits Offline with an offline reason", async () => {
    setStatus.mockClear();
    setStatus.mockResolvedValue(true);
    const { default: AgentDesktop } = await import(
      "@/components/agent/AgentDesktop"
    );
    render(<AgentDesktop />);

    fireEvent.click(screen.getByRole("button", { name: /^offline$/i }));
    expect(screen.getByLabelText("status-reason")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /ended_shift/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^break$/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("status-reason"), {
      target: { value: "ended_shift" },
    });

    await waitFor(() => {
      expect(setStatus).toHaveBeenCalledWith("offline", "ended_shift");
    });
  });

  test("submits Away with an away reason and only one Other option", async () => {
    setStatus.mockClear();
    setStatus.mockResolvedValue(true);
    const { default: AgentDesktop } = await import(
      "@/components/agent/AgentDesktop"
    );
    render(<AgentDesktop />);

    fireEvent.click(screen.getByRole("button", { name: /^away$/i }));
    const otherOptions = screen.getAllByRole("option", { name: /^other$/i });
    expect(otherOptions).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("status-reason"), {
      target: { value: "break" },
    });

    await waitFor(() => {
      expect(setStatus).toHaveBeenCalledWith("away", "break");
    });
  });

  test("Cancel closes the reason picker without changing status", async () => {
    setStatus.mockClear();
    const { default: AgentDesktop } = await import(
      "@/components/agent/AgentDesktop"
    );
    render(<AgentDesktop />);

    fireEvent.click(screen.getByRole("button", { name: /^offline$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByLabelText("status-reason")).not.toBeInTheDocument();
    expect(setStatus).not.toHaveBeenCalled();
  });

  test("keeps the reason picker open when status update fails", async () => {
    setStatus.mockClear();
    setStatus.mockResolvedValue(false);
    const { default: AgentDesktop } = await import(
      "@/components/agent/AgentDesktop"
    );
    render(<AgentDesktop />);

    fireEvent.click(screen.getByRole("button", { name: /^away$/i }));
    fireEvent.change(screen.getByLabelText("status-reason"), {
      target: { value: "lunch" },
    });

    await waitFor(() => {
      expect(setStatus).toHaveBeenCalledWith("away", "lunch");
    });
    expect(screen.getByLabelText("status-reason")).toBeInTheDocument();
  });
});
