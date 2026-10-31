import { useCallback, useEffect, useRef } from "react";
import type { Device } from "@twilio/voice-sdk";
import { logger } from "@/lib/logger.client";
import { createCallAudioInput } from "@/lib/twilio/call-audio-input.client";

export function useTwilioAudioInput(device: Device | null) {
  const ownerRef = useRef<{
    audio: NonNullable<Device["audio"]>;
    input: ReturnType<typeof createCallAudioInput>;
    live: boolean;
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
    const owner = { audio, input, live: true };
    ownerRef.current = owner;
    return () => {
      owner.live = false;
      void input.dispose().catch((error: unknown) => {
        logger.error("Error releasing microphone:", error);
      });
    };
  }, [device]);

  return useCallback(async (deviceId: string): Promise<boolean> => {
    const owner = ownerRef.current;
    if (!owner?.live || owner.audio !== device?.audio) return false;
    await owner.input.select(deviceId);
    return owner.live && ownerRef.current === owner && owner.audio === device?.audio;
  }, [device]);
}
