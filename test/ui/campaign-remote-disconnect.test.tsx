import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Device } from "@twilio/voice-sdk";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CallControls, StatusBar } from "@/components/call/CallScreen.CallArea";
import { useCallHandling } from "@/hooks/call/useCallHandling";
import { useCallState } from "@/hooks/call/useCallState";
import { useCampaignCallFlow } from "@/hooks/call/useCampaignCallFlow";
import { useRemoteHangupReconcile } from "@/hooks/call/useRemoteHangupReconcile";
import type { QueueItem } from "@/lib/types";
import {
  createMockTwilioCall,
  createMockTwilioDevice,
} from "./hooks-test-helpers";

const boundary = vi.hoisted(() => ({
  onChange: null as ((payload: unknown) => void) | null,
  hangupCall: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/lib/services/hooks-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/hooks-api")>()),
  hangupCall: boundary.hangupCall,
}));

vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: (options: {
    onChange: (payload: unknown) => void;
  }) => {
    boundary.onChange = options.onChange;
  },
}));

const recipient = { contact: { phone: "+15551234567" } } as QueueItem;

function CampaignCall({ device, dial }: { device: Device; dial: () => void }) {
  const { state, send } = useCallState();
  const session = useCallHandling({
    device,
    workspaceId: "ws",
    onCallStateChange: (next) => {
      if (next === "dialing") send({ type: "START_DIALING" });
      if (next === "completed") send({ type: "HANG_UP" });
    },
  });
  const agentSid = session.activeCall?.parameters.CallSid ?? null;
  const flow = useCampaignCallFlow({
    callSid: agentSid,
    agentLegSid: agentSid,
    workspaceId: "ws",
    state,
    activeCall: session.activeCall,
    recentAttemptDisposition: null,
    predictiveState: { contact_id: null, status: "idle" },
    isPredictive: false,
    send,
  });
  useRemoteHangupReconcile({
    displayState: flow.displayState,
    callState: session.callState,
    isPredictive: false,
    terminalCallSid: flow.terminalCallSid,
    hangUp: session.hangUp,
  });
  return (
    <>
      <StatusBar displayState={flow.displayState} callDuration={0} />
      <CallControls
        isBusy={false}
        nextRecipient={recipient}
        hangUp={() => {
          void session.hangUp();
        }}
        handleVoiceDrop={() => {}}
        handleDialNext={() => {
          dial();
          flow.beginDial();
          session.makeCall({ To: "+15551234567" });
        }}
        predictive={false}
        conference={null}
        voiceDrop={false}
        callState={session.callState}
      />
    </>
  );
}

describe("campaign recipient disconnect", () => {
  beforeEach(() => {
    boundary.onChange = null;
    boundary.hangupCall.mockReset().mockResolvedValue({ success: true });
  });

  afterEach(() => vi.restoreAllMocks());

  test.each(["none", "call", "device", "both"])(
    "returns to guarded Dial when SDK teardown failure is %s",
    async (failure) => {
      const call = createMockTwilioCall({
        parameters: { CallSid: "CA-agent" },
      });
      const device = createMockTwilioDevice();
      device.connect.mockResolvedValue(call);
      if (failure === "call" || failure === "both")
        call.disconnect.mockImplementation(() => {
          throw new Error("Signaling transport closed");
        });
      if (failure === "device" || failure === "both")
        device.disconnectAll.mockImplementation(() => {
          throw new Error("Device transport closed");
        });
      const dial = vi.fn();
      render(<CampaignCall device={device as unknown as Device} dial={dial} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Dial", exact: true }),
      );
      await waitFor(() => expect(call.on).toHaveBeenCalled());
      act(() => call.emit("accept"));
      act(() =>
        boundary.onChange?.({
          new: {
            sid: "CA-customer",
            parent_call_sid: "CA-agent",
            status: "in-progress",
          },
        }),
      );
      expect(screen.getByRole("status")).toHaveTextContent("Connected");
      expect(
        screen.getByRole("button", { name: "Hang Up", exact: true }),
      ).toBeEnabled();

      act(() =>
        boundary.onChange?.({
          new: {
            sid: "CA-other-customer",
            parent_call_sid: "CA-other-agent",
            status: "completed",
          },
        }),
      );
      expect(screen.getByRole("status")).toHaveTextContent("Connected");
      expect(
        screen.getByRole("button", { name: "Hang Up", exact: true }),
      ).toBeEnabled();

      await act(async () => {
        boundary.onChange?.({
          new: {
            sid: "CA-customer",
            parent_call_sid: "CA-agent",
            status: "completed",
          },
        });
      });

      expect(screen.getByRole("status")).toHaveTextContent("Call Completed");
      expect(
        screen.queryByRole("button", { name: /hang up/i }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", {
          name: "Click again to call back",
          exact: true,
        }),
      );
      expect(dial).toHaveBeenCalledTimes(1);
      expect(device.connect).toHaveBeenCalledTimes(1);
      fireEvent.click(
        screen.getByRole("button", { name: "Dial", exact: true }),
      );
      expect(dial).toHaveBeenCalledTimes(2);
    },
  );
});
