import { mock } from "bun:test";

const fixture = JSON.parse(process.argv[2] ?? "{}");
mock.module("@/lib/env.server", () => ({
  env: { TWILIO_APP_SID: () => fixture.applicationSid },
}));
mock.module("@/lib/workspace-members-db.server", () => ({
  getWorkspaceById: async () => ({
    twilio_data: JSON.stringify({ sid: fixture.accountSid }),
    key: fixture.keySid,
    token: fixture.secret,
  }),
}));

const originalNow = Date.now;
Date.now = () => fixture.now * 1000;
try {
  const { generateToken } = await import("@/lib/twilio-token.server");
  const { createHandsetAccessToken } = await import(
    "@/lib/handset/handset-token.server"
  );
  const browser = await generateToken({
    twilioAccountSid: fixture.accountSid,
    twilioApiKey: fixture.keySid,
    twilioApiSecret: fixture.secret,
    identity: "browser-agent",
  });
  const handset = await createHandsetAccessToken({
    workspaceId: "fixture-workspace",
    clientIdentity: "handset-agent",
  });
  if (handset.error || !handset.token)
    throw new Error(handset.error ?? "Missing token");
  process.stdout.write(JSON.stringify({ browser, handset: handset.token }));
} finally {
  Date.now = originalNow;
}
