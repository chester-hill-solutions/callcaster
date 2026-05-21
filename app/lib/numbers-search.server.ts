export {
  NUMBER_SEARCH_MODES,
  NUMBER_SEARCH_LIMIT,
  parseNumberSearchRequest,
  buildNumberSearchListParams,
} from "@/lib/schemas/api/numbers-search";
export type { NumberSearchMode, NumberSearchQuery } from "@/lib/schemas/api/numbers-search";

export type AvailableNumberRecord = {
  phoneNumber: string;
  friendlyName: string;
  region?: string;
  locality?: string;
  capabilities: Record<string, boolean>;
};

export type NumbersSearchResponse =
  | { ok: true; numbers: AvailableNumberRecord[] }
  | { ok: false; error: string };

export function mapTwilioAvailableNumbers(
  locals: Array<{
    phoneNumber?: string;
    friendlyName?: string;
    region?: string;
    locality?: string;
    capabilities?: Record<string, boolean>;
  }>,
): AvailableNumberRecord[] {
  return locals
    .filter((n) => n.phoneNumber && n.friendlyName)
    .map((n) => ({
      phoneNumber: n.phoneNumber!,
      friendlyName: n.friendlyName!,
      region: n.region,
      locality: n.locality,
      capabilities: n.capabilities ?? {},
    }));
}

export function jsonNumbersSearchResponse(
  body: NumbersSearchResponse,
  status = body.ok ? 200 : 400,
): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
