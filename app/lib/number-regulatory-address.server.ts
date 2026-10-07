import type Twilio from "twilio";
import {
  isNanpTollFreeNumber,
  normalizeAddressRequirement,
  resolveAddressForRequirement,
} from "@/lib/number-address-requirements";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { isObject } from "@/lib/type-safety-utils";

function addressFailure(error: string) {
  return {
    ok: false as const,
    status: 400,
    addressRequirementError: true as const,
    error,
  };
}

export async function resolveNumberPurchaseAddress(
  twilio: Twilio.Twilio,
  workspaceId: string,
  phoneNumber: string,
) {
  // Product search exposes Canadian inventory; use the same country at purchase.
  const inventory = twilio.availablePhoneNumbers("CA");
  const params = { contains: phoneNumber, limit: 20 };
  const context = {
    workspaceId,
    operation: "numberPurchase.regulatoryInventory",
  };
  const numbers = isNanpTollFreeNumber(phoneNumber)
    ? await withTwilioRetry(() => inventory.tollFree.list(params), context)
    : await withTwilioRetry(() => inventory.local.list(params), context);
  const number = numbers.find(
    (candidate) => candidate.phoneNumber === phoneNumber,
  );
  if (!number) {
    return {
      ok: false as const,
      status: 409,
      error:
        "That phone number is no longer available. Search again and pick another number.",
    };
  }
  const requirement = normalizeAddressRequirement(number.addressRequirements);
  const addresses =
    requirement === "none"
      ? []
      : await withTwilioRetry(() => twilio.addresses.list({ pageSize: 100 }), {
          workspaceId,
          operation: "numberPurchase.regulatoryAddresses",
        });
  const resolution = resolveAddressForRequirement({
    requirement,
    numberIsoCountry: number.isoCountry || "CA",
    addresses: addresses.filter(
      (address) => address.accountSid === twilio.accountSid,
    ),
  });
  return resolution.ok ? resolution : addressFailure(resolution.error);
}

export function numberPurchaseAddressRejection(error: unknown) {
  if (
    !isObject(error) ||
    typeof error.code !== "number" ||
    ![18018, 21615, 21631, 21628, 21629].includes(error.code)
  )
    return null;
  return addressFailure(
    "The phone provider rejected this number's regulatory address. Check the validated address in Numbers settings, then retry.",
  );
}
