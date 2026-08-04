import type { NumbersSearchResponse } from "@/lib/numbers-search.server";
import type { AddressRequirement } from "@/lib/number-address-requirements";

export type AvailableNumber = {
  phoneNumber: string;
  friendlyName: string;
  region?: string;
  locality?: string;
  /** ISO country of the available number (e.g. "CA"). */
  isoCountry?: string;
  /** Q43: Twilio regulatory address requirement (none|any|local|foreign). */
  addressRequirements?: AddressRequirement;
  capabilities: Record<string, boolean>;
};

export type NumbersSearchFetcherData = NumbersSearchResponse | undefined;

export type PurchaseFetcherData = {
  newNumber?: { friendly_name?: string; phone_number?: string };
  creditsError?: boolean;
  /** Q43: purchase blocked because no validated address satisfies the number's regulation. */
  addressRequirementError?: boolean;
  error?: string;
  partialSuccess?: boolean;
  messagingServiceAttached?: boolean;
  messagingServiceAttachError?: string;
};
