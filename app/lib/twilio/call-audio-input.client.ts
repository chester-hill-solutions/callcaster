import type { Device } from "@twilio/voice-sdk";

type AudioInput = Pick<NonNullable<Device["audio"]>, "setInputDevice" | "unsetInputDevice">;

export function createCallAudioInput(audio: AudioInput) {
  let disposed = false;
  let pending = Promise.resolve();
  let release: Promise<void> | null = null;

  return {
    select(deviceId: string): Promise<void> {
      const selection = pending.then(async () => {
        if (!disposed) await audio.setInputDevice(deviceId);
      });
      pending = selection.catch(() => {});
      return selection;
    },
    dispose(): Promise<void> {
      disposed = true;
      // The SDK can acquire a stream after Device.destroy() has cleared device.audio.
      release ??= pending.then(() => audio.unsetInputDevice());
      return release;
    },
  };
}
