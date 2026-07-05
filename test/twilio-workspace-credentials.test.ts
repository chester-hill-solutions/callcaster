import { describe, expect, test } from "vitest";
import {
  readTwilioWorkspaceCredentials,
  resolveTwilioWebhookAuthToken,
} from "../app/lib/twilio-workspace-credentials.ts";

describe("readTwilioWorkspaceCredentials", () => {
  test("null and non-objects", () => {
    expect(readTwilioWorkspaceCredentials(null)).toBeNull();
    expect(readTwilioWorkspaceCredentials(undefined)).toBeNull();
    expect(readTwilioWorkspaceCredentials("x")).toBeNull();
    expect(readTwilioWorkspaceCredentials([])).toBeNull();
  });

  test("camelCase sid + authToken", () => {
    expect(
      readTwilioWorkspaceCredentials({
        sid: "AC01",
        authToken: "tok",
      }),
    ).toEqual({ sid: "AC01", authToken: "tok" });
  });

  test("snake_case account_sid + auth_token", () => {
    expect(
      readTwilioWorkspaceCredentials({
        account_sid: "AC02",
        auth_token: "secret",
      }),
    ).toEqual({ sid: "AC02", authToken: "secret" });
  });

  test("accountSid alias", () => {
    expect(
      readTwilioWorkspaceCredentials({
        accountSid: "AC03",
        authToken: "t",
      }),
    ).toEqual({ sid: "AC03", authToken: "t" });
  });

  test("missing pieces", () => {
    expect(readTwilioWorkspaceCredentials({ sid: "AC" })).toBeNull();
    expect(readTwilioWorkspaceCredentials({ authToken: "x" })).toBeNull();
  });
});

describe("resolveTwilioWebhookAuthToken", () => {
  test("returns workspace token when creds present", () => {
    expect(
      resolveTwilioWebhookAuthToken({ sid: "AC01", authToken: "workspace-tok" }),
    ).toBe("workspace-tok");
  });

  test("returns null when creds missing", () => {
    expect(resolveTwilioWebhookAuthToken(null)).toBeNull();
  });
});
