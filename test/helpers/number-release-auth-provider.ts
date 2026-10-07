import RequestClient from "twilio/lib/base/RequestClient";
import { vi } from "vitest";

export const RELEASE_ACCOUNT = `AC${"1".repeat(32)}`;
export const RELEASE_PARENT = `AC${"2".repeat(32)}`;
export const RELEASE_NUMBER = `PN${"3".repeat(32)}`;
export const RELEASE_SERVICE = `MG${"4".repeat(32)}`;
export const RELEASE_OLD_KEY = `SK${"5".repeat(32)}`;
export const RELEASE_NEW_KEY = `SK${"6".repeat(32)}`;
export const RELEASE_PHONE = "+14165550217";

export function numberReleaseAuthProvider() {
  const state = {
    rejectOldKey: false,
    rejectStoredToken: false,
    rejectNewKey: false,
    rejectSenderKey: false,
    rejectDeleteKey: false,
    outgoing: false,
    owner: RELEASE_PARENT,
    account: RELEASE_ACCOUNT,
    status: "active",
    authToken: "current-fixture-token",
    keySid: RELEASE_NEW_KEY,
    keySecret: "new-fixture-secret",
    active: true,
    attached: true,
    resourceAccount: RELEASE_ACCOUNT,
    firstFailure: undefined as { status: number; code: number } | undefined,
    deleteFailure: undefined as
      | { target: "sender" | "incoming" | "outgoing"; kind: "network" | "server" }
      | undefined,
    onRejectedKey: undefined as (() => Promise<void>) | undefined,
    onAccountRead: undefined as (() => Promise<void>) | undefined,
    onKeyCreate: undefined as (() => Promise<void>) | undefined,
  };
  const rejectedCredentials = (
    username: string | undefined,
    password: string | undefined,
    hostname: string,
    method: string,
  ) =>
    (username === RELEASE_OLD_KEY &&
      (state.rejectOldKey ||
        (state.rejectDeleteKey && method === "delete") ||
        (state.rejectSenderKey && hostname === "messaging.twilio.com"))) ||
    (username === RELEASE_ACCOUNT &&
      state.rejectStoredToken &&
      password === "stored-fixture-token") ||
    (username === RELEASE_NEW_KEY && state.rejectNewKey);
  const request = vi
    .spyOn(RequestClient.prototype, "request")
    .mockImplementation(async (args) => {
      const url = new URL(args.uri);
      const path = url.pathname;
      const method = args.method.toLowerCase();
      let body: object;
      let statusCode = 200;
      if (
        method === "delete" &&
        state.deleteFailure &&
        ((state.deleteFailure.target === "sender" &&
          url.hostname === "messaging.twilio.com") ||
          (state.deleteFailure.target === "incoming" &&
            path.includes("/IncomingPhoneNumbers/")) ||
          (state.deleteFailure.target === "outgoing" &&
            path.includes("/OutgoingCallerIds/")))
      ) {
        const failure = state.deleteFailure;
        state.deleteFailure = undefined;
        if (failure.kind === "network") {
          if (failure.target === "sender") state.attached = false;
          else state.active = false;
          throw Object.assign(new Error("ECONNRESET: owned delete acknowledgement lost"), {
            code: "ECONNRESET",
          });
        }
        return {
          statusCode: 500,
          headers: {},
          body: JSON.stringify({ code: 20500, message: "Owned server failure" }),
        };
      }
      if (state.firstFailure && path.includes("/IncomingPhoneNumbers/")) {
        const failure = state.firstFailure;
        state.firstFailure = undefined;
        return {
          statusCode: failure.status,
          headers: {},
          body: JSON.stringify({
            ...failure,
            message: "Owned failure control",
          }),
        };
      }
      if (
        rejectedCredentials(args.username, args.password, url.hostname, method)
      ) {
        if (args.username === RELEASE_OLD_KEY) await state.onRejectedKey?.();
        return {
          statusCode: 401,
          headers: {},
          body: JSON.stringify({
            code: 20003,
            message: "Owned credential rejection",
            status: 401,
          }),
        };
      }
      switch (`${method} ${url.hostname}${path}`) {
        case `get api.twilio.com/2010-04-01/Accounts/${RELEASE_ACCOUNT}.json`:
          if (args.username !== RELEASE_PARENT)
            throw new Error("Unexpected account lookup credentials");
          await state.onAccountRead?.();
          body = {
            sid: state.account,
            owner_account_sid: state.owner,
            status: state.status,
            auth_token: state.authToken,
          };
          break;
        case `post api.twilio.com/2010-04-01/Accounts/${RELEASE_ACCOUNT}/Keys.json`:
          if (args.username !== RELEASE_ACCOUNT)
            throw new Error("Key must be minted on original subaccount");
          await state.onKeyCreate?.();
          statusCode = 201;
          body = { sid: state.keySid, secret: state.keySecret };
          break;
        case `delete api.twilio.com/2010-04-01/Accounts/${RELEASE_ACCOUNT}/IncomingPhoneNumbers/${RELEASE_NUMBER}.json`:
          state.active = false;
          statusCode = 204;
          body = {};
          break;
        case `get api.twilio.com/2010-04-01/Accounts/${RELEASE_ACCOUNT}/IncomingPhoneNumbers/${RELEASE_NUMBER}.json`:
          body = {
            sid: RELEASE_NUMBER,
            account_sid: state.resourceAccount,
            phone_number: RELEASE_PHONE,
          };
          break;
        case `get api.twilio.com/2010-04-01/Accounts/${RELEASE_ACCOUNT}/OutgoingCallerIds.json`:
          body = {
            outgoing_caller_ids: state.outgoing
              ? [
                  {
                    sid: RELEASE_NUMBER,
                    account_sid: RELEASE_ACCOUNT,
                    phone_number: RELEASE_PHONE,
                  },
                ]
              : [],
            next_page_uri: null,
          };
          break;
        case `get api.twilio.com/2010-04-01/Accounts/${RELEASE_ACCOUNT}/OutgoingCallerIds/${RELEASE_NUMBER}.json`:
          body = {
            sid: RELEASE_NUMBER,
            account_sid: state.resourceAccount,
            phone_number: RELEASE_PHONE,
          };
          break;
        case `delete api.twilio.com/2010-04-01/Accounts/${RELEASE_ACCOUNT}/OutgoingCallerIds/${RELEASE_NUMBER}.json`:
          state.active = false;
          statusCode = 204;
          body = {};
          break;
        case `delete messaging.twilio.com/v1/Services/${RELEASE_SERVICE}/PhoneNumbers/${RELEASE_NUMBER}`:
          if (
            ![RELEASE_OLD_KEY, RELEASE_NEW_KEY].some(
              (key) => key === args.username,
            )
          )
            throw new Error("Sender detach must use a subaccount API key");
          state.attached = false;
          statusCode = 204;
          body = {};
          break;
        default:
          throw new Error(
            `Unexpected owned provider operation ${method} ${args.uri}`,
          );
      }
      return { statusCode, headers: {}, body: JSON.stringify(body) };
    });
  const calls = () => request.mock.calls.map(([args]) => args);
  return {
    state,
    request,
    calls,
    keyCreates: () =>
      calls().filter(
        (r) =>
          r.method.toLowerCase() === "post" && r.uri.endsWith("/Keys.json"),
      ),
    accountReads: () =>
      calls().filter(
        (r) =>
          r.method.toLowerCase() === "get" &&
          r.uri.endsWith(`/Accounts/${RELEASE_ACCOUNT}.json`),
      ),
    deletes: () => calls().filter((r) => r.method.toLowerCase() === "delete"),
  };
}
