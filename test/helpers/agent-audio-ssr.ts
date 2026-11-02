import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useAgentAudioConnection } from "@/hooks/call/useAgentAudioConnection";
import { useManualAudioDial } from "@/hooks/call/useManualAudioDial";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";

const workspaceId = "10000000-0000-4000-8000-000000000001";

function AudioSelection() {
  const { state } = useAgentAudioConnection(workspaceId, "audio-ssr-agent");
  return createElement("p", null, state.restoring ? "Checking audio" : "Audio ready");
}

function ManualDial() {
  const { state } = useManualAudioDial(workspaceId, "audio-ssr-agent", 1);
  return createElement("p", null, state.pending ? "Confirming call" : "Ready to dial");
}

export function renderAudioSelection() {
  return renderToString(createElement(AudioSelection));
}

export function renderManualDial() {
  return renderToString(createElement(ManualDial));
}

function PredictiveDialer() {
  const state = useStartConferenceAndDial({ workspaceId, userId: "audio-ssr-agent", campaignId: "1",
    callerId: "+16135550101", selectedDevice: "computer" });
  return createElement("p", null, state.stopPending ? "Stop pending" : "Ready to start");
}
export function renderPredictiveDialer() {
  return renderToString(createElement(PredictiveDialer));
}
