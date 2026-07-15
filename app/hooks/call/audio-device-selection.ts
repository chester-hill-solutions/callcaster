export const AUDIO_DEVICE_UNAVAILABLE_VALUE = "__audio_device_unavailable__";

export function getUsableAudioDevices(
  devices: MediaDeviceInfo[],
  kind: "audioinput" | "audiooutput",
): MediaDeviceInfo[] {
  return devices.filter((device) => device.kind === kind && device.deviceId !== "");
}

export function reconcileAudioDeviceId(
  devices: MediaDeviceInfo[],
  selectedId: string | null,
): string | null {
  if (selectedId && devices.some((device) => device.deviceId === selectedId)) {
    return selectedId;
  }

  const defaultDevice = devices.find((device) => device.deviceId === "default");
  if (defaultDevice) {
    return defaultDevice.deviceId;
  }

  return devices.find((device) => device.deviceId !== "")?.deviceId ?? null;
}
