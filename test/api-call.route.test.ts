import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "./helpers/route-result";
import { action } from "../app/routes/api+/call.action.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";

vi.mock("@/lib/twilio-webhook.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/twilio-webhook.server")>(),
  requireTwilioSignature: vi.fn(async () => null),
}));

describe("SDK call instruction input boundary", () => {
  beforeEach(() => { vi.mocked(requireTwilioSignature).mockReset().mockResolvedValue(null); });
  const valid = {
    To: "+15555550100", workspace_id: "workspace-one", client_identity: "handset-one",
    credit_reservation: "10000000-0000-4000-8000-000000000001",
    CallSid: `CA${"1".repeat(32)}`, AccountSid: `AC${"2".repeat(32)}`,
    From: "client:handset-one", Direction: "inbound",
  };
  async function send(params: Record<string, string>) {
    return asRouteResponse(action(routeArgs(new Request("http://localhost/api/call", {
      method: "POST", body: new URLSearchParams(params),
    }))));
  }
  test.each(["workspace_id", "client_identity", "credit_reservation", "CallSid", "AccountSid"])(
    "requires %s instead of falling back to an unfunded dial", async (missing) => {
      const params: Record<string, string> = { ...valid }; delete params[missing];
      const denied = await send(params);
      expect(denied.status).toBe(403); expect(await denied.text()).not.toContain("<Dial");
    },
  );
  test.each(["", "not-a-phone"])("does not issue instructions for recipient %j", async (To) => {
    const denied = await send({ ...valid, To });
    expect(await denied.text()).not.toContain("<Dial");
    expect(denied.headers.get("Content-Type")).toBe("text/xml");
  });
  test("keeps a signature denial ahead of instruction work", async () => {
    vi.mocked(requireTwilioSignature).mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));
    const denied = await send(valid);
    expect(denied.status).toBe(403); expect(await denied.text()).toBe("Forbidden");
  });
});
