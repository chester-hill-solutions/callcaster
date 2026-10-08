import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fixture = vi.hoisted(() => {
  process.env.TZ = "UTC";
  return {
    loader: {
      handsetNumber: "+15551234567",
      clientIdentity: "identity",
      workspaceId: "w1",
      token: null as string | null,
      tokenError: null as string | null,
      agentStatus: {
        status: "offline",
        status_started_at: null,
        status_reason: null,
      },
      userId: "u1",
    },
    loading: false,
    statusError: null as string | null,
    setStatus: vi.fn(async () => true),
    submit: vi.fn(),
    navigate: vi.fn(),
    microphone: vi.fn(),
    stopTrack: vi.fn(),
    endSession: vi.fn(),
  };
});
const stableFetcher = { submit: fixture.submit };

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  Link: ({
    children,
    to,
    ...props
  }: React.ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLoaderData: () => fixture.loader,
  useNavigate: () => fixture.navigate,
  useFetcher: () => stableFetcher,
  useOutletContext: () => ({ env: { BASE_URL: "http://localhost" } }),
}));
vi.mock("@/hooks/handset/useEndSessionOnUnmount", () => ({
  useEndSessionOnUnmount: () => undefined,
}));
vi.mock("@/hooks/agent/useAgentStatus", () => ({
  useAgentStatus: () => ({
    agentStatus: null,
    setStatus: fixture.setStatus,
    loading: fixture.loading,
    error: fixture.statusError,
  }),
}));
vi.mock("@/hooks/call/useSoftphoneController", () => ({
  useSoftphoneController: () => ({
    connection: { device: null },
    callHandling: {
      activeCall: null,
      heldCalls: [],
      isMicMuted: false,
      setMicMuted: vi.fn(),
    },
    incomingCall: null,
    showOutboundDialer: false,
    handleEndSession: fixture.endSession,
  }),
}));
vi.mock("@/hooks/call/useSoftphoneAudioDevices", () => ({
  useSoftphoneAudioDevices: () => ({}),
}));

import AgentDesktop from "@/components/agent/AgentDesktop";

beforeEach(() => {
  fixture.loader.token = null;
  fixture.loader.tokenError = null;
  fixture.loader.agentStatus.status = "offline";
  fixture.loading = false;
  fixture.statusError = null;
  fixture.setStatus.mockReset().mockResolvedValue(true);
  fixture.microphone
    .mockReset()
    .mockRejectedValue(new Error("Permission denied"));
  fixture.stopTrack.mockReset();
  fixture.submit.mockReset();
  fixture.endSession.mockReset();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: fixture.microphone },
  });
});

describe("Agent startup feedback with shared controls", () => {
  test("shows a token failure once and keeps its recovery link after revalidation", () => {
    fixture.loader.tokenError = "Phone connection could not start. Try again.";
    const { rerender } = render(<AgentDesktop />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getAllByText(fixture.loader.tokenError)).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Back to workspace" }),
    ).toHaveAttribute("href", "/workspaces/w1");
    rerender(<AgentDesktop />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText("Waiting for calls...")).not.toBeInTheDocument();
  });

  test("updates and clears the message inside the same reserved region", () => {
    const { rerender } = render(<AgentDesktop />);
    const region = screen.getByRole("region", { name: "Connection status" });
    const recovery = screen.getByRole("link", { name: "Back to workspace" });
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
    fixture.loader.tokenError = "Connection failed.";
    rerender(<AgentDesktop />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fixture.loader.tokenError =
      "Check microphone access and workspace phone settings before trying to connect again.";
    rerender(<AgentDesktop />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      fixture.loader.tokenError,
    );
    fixture.loader.tokenError = null;
    rerender(<AgentDesktop />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Connection status" })).toBe(
      region,
    );
    expect(screen.getByRole("link", { name: "Back to workspace" })).toBe(
      recovery,
    );
    expect(fixture.submit).not.toHaveBeenCalled();
  });

  test("shows a microphone failure once and does not write Available", async () => {
    render(<AgentDesktop />);
    fireEvent.click(
      screen.getByRole("button", { name: "Available", exact: true }),
    );
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Cannot go Available: microphone access required.",
    );
    expect(fixture.microphone).toHaveBeenCalledWith({ audio: true });
    expect(fixture.setStatus).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Back to workspace" }),
    ).toBeInTheDocument();
  });

  test("keeps status controls locked during an update", () => {
    fixture.loading = true;
    fixture.loader.tokenError = "Connection failed.";
    render(<AgentDesktop />);
    for (const name of ["Available", "Away", "Offline"]) {
      const button = screen.getByRole("button", { name, exact: true });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(fixture.microphone).not.toHaveBeenCalled();
    expect(fixture.setStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  test("allows Available after the device check succeeds", async () => {
    fixture.loader.token = "valid-token";
    fixture.microphone.mockResolvedValue({
      getTracks: () => [{ stop: fixture.stopTrack }],
    });
    render(<AgentDesktop />);
    fireEvent.click(
      screen.getByRole("button", { name: "Available", exact: true }),
    );
    await waitFor(() =>
      expect(fixture.setStatus).toHaveBeenCalledWith("available", undefined),
    );
    expect(fixture.stopTrack).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End session and leave" }),
    ).toBeInTheDocument();
  });

  test("keeps connected status failures in the connected panel", () => {
    fixture.loader.token = "valid-token";
    fixture.statusError = "Status could not be saved. Try again.";
    render(<AgentDesktop />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(fixture.statusError);
    expect(
      screen.queryByRole("region", { name: "Connection status" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "End session and leave" }),
    );
    expect(fixture.endSession).toHaveBeenCalledOnce();
  });
});
