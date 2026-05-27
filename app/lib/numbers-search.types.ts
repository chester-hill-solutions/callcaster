import type { NumbersSearchResponse } from "@/lib/numbers-search.server";

export type AvailableNumber = {
  phoneNumber: string;
  friendlyName: string;
  region?: string;
  locality?: string;
  capabilities: Record<string, boolean>;
};

export type NumbersSearchFetcherData = NumbersSearchResponse | undefined;

export type PurchaseFetcherData = {
  newNumber?: { friendly_name?: string; phone_number?: string };
  creditsError?: boolean;
  error?: string;
  partialSuccess?: boolean;
  messagingServiceAttached?: boolean;
  messagingServiceAttachError?: string;
};
