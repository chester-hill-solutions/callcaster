import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  readTwilioWorkspaceCredentials,
  resolveTwilioWebhookAuthToken,
} from "../_shared/twilio-workspace-credentials.ts";

Deno.test("readTwilioWorkspaceCredentials rejects null and non-objects", () => {
  assertEquals(readTwilioWorkspaceCredentials(null), null);
  assertEquals(readTwilioWorkspaceCredentials(undefined), null);
  assertEquals(readTwilioWorkspaceCredentials("x"), null);
  assertEquals(readTwilioWorkspaceCredentials([]), null);
});

Deno.test("readTwilioWorkspaceCredentials parses camelCase and snake_case", () => {
  assertEquals(
    readTwilioWorkspaceCredentials({ sid: "AC01", authToken: "tok" }),
    { sid: "AC01", authToken: "tok" },
  );
  assertEquals(
    readTwilioWorkspaceCredentials({ account_sid: "AC02", auth_token: "tok2" }),
    { sid: "AC02", authToken: "tok2" },
  );
});

Deno.test("resolveTwilioWebhookAuthToken prefers workspace creds", () => {
  assertEquals(
    resolveTwilioWebhookAuthToken({ sid: "AC01", authToken: "workspace-token" }),
    "workspace-token",
  );
});

Deno.test("resolveTwilioWebhookAuthToken falls back to TWILIO_AUTH_TOKEN outside production", () => {
  Deno.env.set("ENVIRONMENT", "development");
  Deno.env.delete("DENO_DEPLOYMENT_ID");
  Deno.env.set("TWILIO_AUTH_TOKEN", "dev-token");
  assertEquals(resolveTwilioWebhookAuthToken(null), "dev-token");
});

Deno.test("resolveTwilioWebhookAuthToken returns null in production without creds", () => {
  Deno.env.set("ENVIRONMENT", "production");
  Deno.env.delete("TWILIO_AUTH_TOKEN");
  assertEquals(resolveTwilioWebhookAuthToken(null), null);
});
