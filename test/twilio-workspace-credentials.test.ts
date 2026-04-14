import { describe, expect, test } from "vitest";
import { readTwilioWorkspaceCredentials as readTwilioWorkspaceCredentialsEdge } from "../supabase/functions/_shared/twilio-workspace-credentials.ts";
import { readTwilioWorkspaceCredentials as readTwilioWorkspaceCredentialsApp } from "../app/lib/twilio-workspace-credentials.ts";

const readTwilioWorkspaceCredentials = readTwilioWorkspaceCredentialsEdge;

describe("readTwilioWorkspaceCredentials (app vs edge parity)", () => {
  test("snake_case matches between app and Edge copies", () => {
    const payload = { account_sid: "ACx", auth_token: "y" };
    expect(readTwilioWorkspaceCredentialsApp(payload)).toEqual(
      readTwilioWorkspaceCredentialsEdge(payload),
    );
  });
});

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
