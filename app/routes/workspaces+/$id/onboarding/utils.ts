import { isRecord } from "@/lib/parse-utils.server";

export { isRecord };

export function hasVoiceCapability(capabilities: unknown) {
  return isRecord(capabilities) && (capabilities.voice === true || capabilities.voice === "true");
}
