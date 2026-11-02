import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Call } from "@twilio/voice-sdk";
import { toast } from "sonner";
import { hangupCall } from "@/lib/services/hooks-api";
import { logger } from "@/lib/logger.client";

type Options = {
  userId: string;
  workspaceId: string;
  campaignId: number | undefined;
  callSid: string | null;
  isPredictive: boolean;
  activeCall: Call | null;
  sdkHangUp: () => Promise<void>;
  send: (action: { type: "HANG_UP" }) => void;
  isCurrentCustomer: () => boolean;
  confirmCustomerEnded: () => boolean;
  managesCustomerAudio: () => boolean;
  onHangUp?: () => void;
};

/** Customer commands share the call lifecycle and the committed page lifetime. */
export function useCustomerCallControls({ userId, workspaceId, campaignId, callSid,
  isPredictive, activeCall, sdkHangUp, send, isCurrentCustomer, confirmCustomerEnded, managesCustomerAudio, onHangUp }: Options) {
  const scope = JSON.stringify([userId, workspaceId, campaignId]);
  const owner = useMemo(() => ({ scope, active: false, epoch: 0 }), [scope]);
  const currentSdkCall = useRef(activeCall);
  currentSdkCall.current = activeCall;

  /**
   * @effect Bind customer controls to the committed actor, workspace and campaign.
   * @effect-deps owner (a new page scope creates a new lifetime).
   * @effect-side-effects Retire captured commands and replies on cleanup; no provider cleanup.
   * @effect-why-not-loader Controls can outlive a page through pending HTTP replies and retained callbacks.
   */
  useEffect(() => {
    owner.active = true;
    owner.epoch++;
    return () => { owner.active = false; owner.epoch++; };
  }, [owner]);

  const canControlCustomer = useCallback(() => owner.active && isCurrentCustomer() &&
    (callSid !== null || currentSdkCall.current === activeCall), [owner, isCurrentCustomer, callSid, activeCall]);

  const hangUp = useCallback(async () => {
    const epoch = owner.epoch;
    const isCurrent = () => canControlCustomer() && owner.epoch === epoch;
    if (!isCurrent()) return;
    onHangUp?.();
    try {
      if (!callSid) {
        if (isPredictive || managesCustomerAudio()) return;
        await sdkHangUp();
        if (isCurrent()) send({ type: "HANG_UP" });
        return;
      }
      const result = await hangupCall({ callSid, workspaceId });
      if (!isCurrent()) return;
      if (result?.success !== true) throw new Error("Could not confirm that the customer call ended. Try again.");
      if (!confirmCustomerEnded()) return;
      if (!isPredictive && !managesCustomerAudio()) {
        try { activeCall?.disconnect(); }
        catch (error) { logger.debug("Customer ended before SDK disconnect completed", error); }
      }
    } catch (error) {
      if (isCurrent()) toast.error(error instanceof Error ? error.message : "Could not end the customer call. Try again.");
    }
  }, [owner, canControlCustomer, callSid, workspaceId, isPredictive, sdkHangUp, send, confirmCustomerEnded, activeCall, managesCustomerAudio, onHangUp]);

  return { hangUp, canControlCustomer };
}
