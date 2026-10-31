import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AgentAudioConnection } from "@/lib/agent-audio-connection.client";
import type { AgentAudioStorage } from "@/lib/agent-audio-storage.client";
import { isVoiceAudioEffective } from "@/lib/voice-audio-client";

// Resolve storage at use time: rendering and server rendering perform no I/O.
const browserStorage: AgentAudioStorage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

export function useAgentAudioConnection(workspaceId: string, userId: string) {
  const resource = useMemo(() => new AgentAudioConnection({ workspaceId, userId }, browserStorage), [workspaceId, userId]);
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);

  /**
   * @effect Own audio polling and saved-request recovery for this actor and workspace.
   * @effect-deps resource (a new owner on actor or workspace changes).
   * @effect-side-effects local storage reads, owned HTTP reads and polling timers.
   * @effect-why-not-loader This external resource also receives user actions and
   * browser storage recovery; its committed lifetime must reject late replies.
   * See https://react.dev/learn/synchronizing-with-effects.
   */
  useEffect(() => resource.mount(), [resource]);
  const phoneSource = state.active?.transport === "phone" && isVoiceAudioEffective(state.active) && !state.active.requested_call_sid
    ? { connectionId: state.active.connection_id, generation: state.active.generation } : undefined;
  const wantsBrowser = !state.restoring && (state.selectedDevice === "computer" || state.preparingBrowser || state.pendingDevice === "computer");
  const ready = !state.restoring && !state.pendingDevice && !state.preparingBrowser && !state.error;
  return { resource, state, phoneSource, wantsBrowser, ready };
}

export function useAgentBrowserReadiness(resource: AgentAudioConnection, requested: boolean, registered: boolean, inputReady: boolean) {
  /**
   * @effect Continue an explicit browser audio change after SDK readiness.
   * @effect-deps resource, requested, registered, inputReady (explicit request and actual resource state).
   * @effect-side-effects completes the already requested audio change.
   * @effect-why-not-loader SDK registration and microphone selection complete
   * asynchronously in the browser. See https://react.dev/learn/synchronizing-with-effects.
   */
  useEffect(() => {
    if (requested && registered && inputReady) void resource.browserReady();
  }, [resource, requested, registered, inputReady]);
}
