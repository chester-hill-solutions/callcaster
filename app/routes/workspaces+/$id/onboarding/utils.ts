export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hasVoiceCapability(capabilities: unknown) {
  return isRecord(capabilities) && (capabilities.voice === true || capabilities.voice === "true");
}
