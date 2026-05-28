import type { TwilioSmsSenderClass } from "@/lib/types";
import { inferSmsSenderClassFromSenderTypes } from "@/lib/twilio-sender-class.server";

export * from "@/lib/throughput-config";

export function inferSmsSenderClassFromNumberTypes(
  numberTypes: string[],
): TwilioSmsSenderClass {
  return inferSmsSenderClassFromSenderTypes(numberTypes);
}
