import { useState, useCallback, useRef } from "react";
import { startConferenceAndDial } from "@/lib/services/hooks-api";
import { logger } from "@/lib/logger.client";

type StartConferenceOptions = {
  userId: string;
  campaignId: string;
  workspaceId: string;
  callerId: string;
  selectedDevice: string;
  showError?: (message: string, creditsError: boolean) => void;
};

export function useStartConferenceAndDial({
  userId,
  campaignId,
  workspaceId,
  callerId,
  selectedDevice,
  showError,
}: StartConferenceOptions) {
  const [conference, setConference] = useState<string | null>(null);
  const [creditsError, setCreditsError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pending = useRef(false);
  const disabledReason = !callerId
    ? "Set caller ID in Setup"
    : !selectedDevice
      ? "Select a device"
      : !userId || !campaignId || !workspaceId
        ? "Reload this campaign"
        : null;

  const begin = useCallback(async () => {
    // Other entry points can call begin twice before React renders busy state.
    if (pending.current) return;
    const fail = (message: string, creditFailure = false) => {
      setError(message);
      setCreditsError(creditFailure);
      showError?.(message, creditFailure);
    };
    if (disabledReason) {
      fail(disabledReason);
      return;
    }

    pending.current = true;
    setIsLoading(true);
    setError(null);
    setCreditsError(false);
    try {
      const result = await startConferenceAndDial({
        caller_id: callerId,
        workspace_id: workspaceId,
        campaign_id: campaignId,
        selected_device: selectedDevice,
      });
      if (result.creditsError) {
        fail("Insufficient credits to start dialing", true);
      } else if (result.success && result.conferenceName) {
        setConference(result.conferenceName);
      } else {
        fail(result.error || "Could not start dialing. Try again.");
      }
    } catch (cause) {
      logger.error("Conference start failed", cause);
      fail(cause instanceof Error ? cause.message : "Could not start dialing. Try again.");
    } finally {
      pending.current = false;
      setIsLoading(false);
    }
  }, [campaignId, workspaceId, callerId, selectedDevice, disabledReason, showError]);

  return { begin, conference, setConference, creditsError, error, isLoading, disabledReason };
}
