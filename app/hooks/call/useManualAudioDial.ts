import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ManualAudioDial } from "@/lib/manual-audio-dial";

export function useManualAudioDial(workspaceId: string, userId: string, campaignId: number) {
  const resource = useMemo(() => new ManualAudioDial({ workspaceId, userId, campaignId }, {
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  }), [workspaceId, userId, campaignId]);
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  /**
   * @effect Recover the saved manual request and reject replies after disposal.
   * @effect-deps resource (actor, workspace and campaign owner).
   * @effect-side-effects browser storage read; no call is sent on mount.
   * @effect-why-not-loader The saved request is browser-owned and explicit
   * Retry sends it. See https://react.dev/learn/synchronizing-with-effects.
   */
  useEffect(() => resource.mount(), [resource]);
  return { resource, state };
}
