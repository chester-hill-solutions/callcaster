import { toast } from "sonner";

/** Toast copy for `?saved=service_address` after saving a regulatory address. */
export const SERVICE_ADDRESS_SAVED_TOAST =
  "Service address saved. Validate it before renting a voice-capable number.";

/** Toast copy for `?saved=emergency_voice` after Twilio validates the address. */
export const SERVICE_ADDRESS_VALIDATED_TOAST = "Service address validated.";

/** Shared `saved` handler for service-address redirects (onboarding + Numbers). */
export function flashServiceAddressSavedParam(value: string): void {
  if (value === "service_address") {
    toast.success(SERVICE_ADDRESS_SAVED_TOAST);
  } else if (value === "emergency_voice") {
    toast.success(SERVICE_ADDRESS_VALIDATED_TOAST);
  }
}

/** Shared `warning` handler that surfaces the redirect query value as a toast. */
export function flashSearchParamWarning(value: string): void {
  toast.warning(value);
}
