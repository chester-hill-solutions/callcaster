import { Twilio } from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import { vi } from "vitest";

export const ADDRESS_ACCOUNT_SID = `AC${"4".repeat(32)}`;
export const REGULATORY_SID = `AD${"5".repeat(32)}`;
export const FOREIGN_SID = `AD${"6".repeat(32)}`;
type AddressRow = {
  sid: string;
  iso_country: string;
  validated: boolean;
  account_sid?: string;
};

export function numberAddressProvider() {
  const state = {
    requirement: "local",
    addresses: [] as AddressRow[],
    nextAddresses: [] as AddressRow[],
    available: true,
    inventoryPhone: undefined as string | undefined,
    lookupFailure: false,
    createCode: undefined as number | undefined,
    createStatus: 400,
  };
  const transport = new RequestClient();
  const request = vi
    .spyOn(transport, "request")
    .mockImplementation(async (args) => {
      if (!args.uri.includes(`/Accounts/${ADDRESS_ACCOUNT_SID}/`)) {
        throw new Error("Unexpected provider account");
      }
      let body: object;
      let statusCode = 200;
      if (args.uri.includes("/AvailablePhoneNumbers/CA/")) {
        if (state.lookupFailure) throw new Error("Owned inventory read fault");
        body = {
          available_phone_numbers: state.available
            ? [
                {
                  phone_number: state.inventoryPhone ?? args.params?.Contains,
                  friendly_name: "Owned fixture number",
                  iso_country: "CA",
                  address_requirements: state.requirement,
                },
              ]
            : [],
          next_page_uri: null,
        };
      } else if (args.uri.includes("/Addresses.json")) {
        const tail = args.uri.includes("PageToken=tail");
        body = {
          addresses: (tail ? state.nextAddresses : state.addresses).map(
            (address) => ({ account_sid: ADDRESS_ACCOUNT_SID, ...address }),
          ),
          next_page_uri:
            !tail && state.nextAddresses.length
              ? `/2010-04-01/Accounts/${ADDRESS_ACCOUNT_SID}/Addresses.json?PageToken=tail`
              : null,
        };
      } else if (
        args.method.toLowerCase() === "post" &&
        args.uri.endsWith("/IncomingPhoneNumbers.json")
      ) {
        if (state.createCode) {
          statusCode = state.createStatus;
          body = {
            code: state.createCode,
            message: "Owned provider rejection",
            status: state.createStatus,
          };
        } else {
          statusCode = 201;
          body = {
            sid: `PN${"7".repeat(32)}`,
            account_sid: ADDRESS_ACCOUNT_SID,
            phone_number: args.data.PhoneNumber,
            friendly_name: args.data.FriendlyName,
            capabilities: { voice: true, sms: true, mms: true },
          };
        }
      } else if (args.uri.endsWith("/IncomingPhoneNumbers.json")) {
        body = { incoming_phone_numbers: [], next_page_uri: null };
      } else {
        throw new Error(`Unexpected provider fixture path: ${args.uri}`);
      }
      return { statusCode, headers: {}, body: JSON.stringify(body) };
    });
  return {
    state,
    request,
    twilio: new Twilio(ADDRESS_ACCOUNT_SID, "owned-fixture-token", {
      httpClient: transport,
    }),
    creates: () =>
      request.mock.calls
        .map(([args]) => args)
        .filter((args) => args.method.toLowerCase() === "post"),
  };
}
