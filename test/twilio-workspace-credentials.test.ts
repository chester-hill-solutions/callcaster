import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  readTwilioWorkspaceCredentials as readTwilioWorkspaceCredentialsEdge,
  resolveTwilioWebhookAuthToken as resolveTwilioWebhookAuthTokenEdge,
} from "../supabase/functions/_shared/twilio-workspace-credentials.ts";
import {
  readTwilioWorkspaceCredentials as readTwilioWorkspaceCredentialsApp,
  resolveTwilioWebhookAuthToken,
} from "../app/lib/twilio-workspace-credentials.ts";

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

describe("resolveTwilioWebhookAuthToken (app)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test("returns workspace token when creds present", () => {
    expect(
      resolveTwilioWebhookAuthToken({ sid: "AC01", authToken: "workspace-tok" }),
    ).toBe("workspace-tok");
  });

  test("returns null in production when creds missing", () => {
    process.env.NODE_ENV = "production";
    expect(resolveTwilioWebhookAuthToken(null)).toBeNull();
  });

  test("falls back to main token outside production when creds missing", () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "main-tok");
    process.env.NODE_ENV = "test";
    expect(resolveTwilioWebhookAuthToken(null)).toBe("main-tok");
  });
});

describe("resolveTwilioWebhookAuthToken (Edge)", () => {
  const denoEnvGet = vi.fn<(key: string) => string | undefined>();

  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: denoEnvGet },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    denoEnvGet.mockReset();
  });

  test("returns workspace token when creds present", () => {
    expect(
      resolveTwilioWebhookAuthTokenEdge({ sid: "AC01", authToken: "workspace-tok" }),
    ).toBe("workspace-tok");
  });

  test("returns null in production when creds missing", () => {
    denoEnvGet.mockImplementation((key) => {
      if (key === "ENVIRONMENT") return "production";
      if (key === "DENO_DEPLOYMENT_ID") return "deploy-1";
      return undefined;
    });
    expect(resolveTwilioWebhookAuthTokenEdge(null)).toBeNull();
  });

  test("falls back to TWILIO_AUTH_TOKEN outside production when creds missing", () => {
    denoEnvGet.mockImplementation((key) => {
      if (key === "ENVIRONMENT") return "development";
      if (key === "TWILIO_AUTH_TOKEN") return "main-tok";
      return undefined;
    });
    expect(resolveTwilioWebhookAuthTokenEdge(null)).toBe("main-tok");
  });
});
