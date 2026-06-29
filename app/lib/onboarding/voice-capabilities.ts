import { isObject } from "@/lib/type-safety-utils";

export function hasVoiceCapability(capabilities: unknown) {
  return isObject(capabilities) && (capabilities.voice === true || capabilities.voice === "true");
}
