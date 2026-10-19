import { useCallback, useEffect, useRef } from "react";
import type { Device } from "@twilio/voice-sdk";
import { logger } from "@/lib/logger.client";
import { createCallAudioInput } from "@/lib/twilio/call-audio-input.client";

export function useTwilioAudioInput(device: Device | null) {
  const ownerRef = useRef<{
    audio: NonNullable<Device["audio"]>;
    input: ReturnType<typeof createCallAudioInput>;
  } | null>(null);

  /**
   * @effect Own SDK input selection and release it after pending capture completes.
   * @effect-deps device (one input owner per device effect lifetime).
   * @effect-side-effects media capture release through SDK unsetInputDevice.
   * @effect-why-not-loader Browser media ownership ends with the device lifetime.
   */
  useEffect(() => {
    const audio = device?.audio;
    if (!audio) return;
    const previous = ownerRef.current;
    // StrictMode can reuse this helper before the prior effect has released it.
    const afterRelease = previous?.audio === audio ? previous.input.dispose() : undefined;
    const input = createCallAudioInput(audio, afterRelease);
    ownerRef.current = { audio, input };
    return () => {
      void input.dispose().catch((error: unknown) => {
        logger.error("Error releasing microphone:", error);
      });
    };
  }, [device]);

  return useCallback((deviceId: string): Promise<void> => {
    const owner = ownerRef.current;
    if (!owner || owner.audio !== device?.audio) return Promise.resolve();
    return owner.input.select(deviceId);
  }, [device]);
}
