import { useEffect, useRef } from "react";
import type { Call } from "@twilio/voice-sdk";
import { stopOwnedSdkCall } from "./useCallHandling";

/** Keep provider teardown with the physical resource's original workspace. */
export function useOwnedSdkCallCleanup(call: Call | null, workspaceId: string) {
  const ownedActiveCall = useRef({ call, workspaceId });
  if (ownedActiveCall.current.call !== call) {
    ownedActiveCall.current = { call, workspaceId };
  }

  /**
   * @effect End the owned active SDK call through the provider on workspace exit.
   * @effect-deps workspaceId; the resource ref keeps the physical call's original workspace.
   * @effect-side-effects Provider hangup only; SDK disconnect belongs to
   * useTwilioConnection. Retired page commands and UI callbacks stay retired.
   * @effect-why-not-loader Resource teardown on scope change or unmount, outside loader requests.
   */
  useEffect(() => () => {
    const owned = ownedActiveCall.current;
    if (owned.call && owned.workspaceId === workspaceId) void stopOwnedSdkCall(owned.call, owned.workspaceId);
  }, [workspaceId]);
}
