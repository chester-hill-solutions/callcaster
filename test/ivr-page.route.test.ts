import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import {
  findCallWithCampaignScriptBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";

const mocks = vi.hoisted(() => {
  return {
    requireTwilioSignature: vi.fn(),
    env: {
      BASE_URL: () => "https://base.example",
      BETTER_AUTH_URL: () => "https://sb.example",
      BETTER_AUTH_SERVICE_KEY: () => "svc",
      TWILIO_AUTH_TOKEN: () => "tok",
    },
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...a: unknown[]) =>
    mocks.requireTwilioSignature(...a),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  findCallWithCampaignScriptBySid: vi.fn(),
  updateOutreachAttemptForWorkspace: vi.fn(),
}));

vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  createSignedObjectUrl: vi.fn(),
}));

vi.mock("@/lib/campaign-ivr.server", () => ({
  ivrScriptStepsFromCampaign: (campaign: any) => campaign?.script?.steps ?? null,
}));

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api+/ivr/route.$campaignId.$pageId.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockResolvedValue(null);
    mocks.logger.error.mockReset();
    vi.mocked(findCallWithCampaignScriptBySid).mockReset();
    vi.mocked(updateOutreachAttemptForWorkspace).mockReset();
    vi.mocked(updateOutreachAttemptForWorkspace).mockResolvedValue({} as never);
    vi.mocked(createSignedObjectUrl).mockReset();
    vi.mocked(createSignedObjectUrl).mockResolvedValue("https://signed");
  });

  test("returns 400 when required params missing", async () => {
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId.route");
    const res = await asRouteResponse(mod.action({
      params: {},
      request: new Request("http://x", { method: "POST", body: new FormData() }),
    } as never));
    expect(res.status).toBe(400);
  });

  test("returns 403 on invalid signature", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }));
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    const res = await asRouteResponse(mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never));
    expect(res.status).toBe(403);
  });

  test("renders the first block inline with no redirect; says error when page invalid; catch path for invalid script and retry failure", async () => {
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");

    // success: the first block is rendered here, not a Redirect to its route
    // (#1842 removed the extra Twilio round-trip before first audio).
    const callData = {
      workspace: "w1",
      campaign_id: 1,
      campaign: {
        script: {
          steps: {
            pages: { page_1: { blocks: ["b1"] } },
            blocks: { b1: { id: "b1", type: "say", audioFile: "hello" } },
          },
        },
      },
    };
    vi.mocked(findCallWithCampaignScriptBySid).mockResolvedValueOnce(callData as any);
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    const successText = await res.text();
    expect(successText).not.toContain("<Redirect>");
    expect(successText).toContain("hello");

    // page missing blocks => say+hangup
    const callData2 = { workspace: "w1", campaign_id: 1, campaign: { script: { steps: { pages: { page_1: { blocks: [] } } } } } };
    vi.mocked(findCallWithCampaignScriptBySid).mockResolvedValueOnce(callData2 as any);
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    expect(await res.text()).toContain("There was an error in the IVR flow");

    // invalid script => catch
    const callData3 = { workspace: "w1", campaign_id: 1, campaign: { script: { steps: null } } };
    vi.mocked(findCallWithCampaignScriptBySid).mockResolvedValueOnce(callData3 as any);
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    expect(await res.text()).toContain("An error occurred. Please try again later.");

    // retry failure without waiting (fake timers)
    vi.useFakeTimers();
    vi.mocked(findCallWithCampaignScriptBySid).mockRejectedValueOnce(new Error("no"));
    const p = mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    await vi.runAllTimersAsync();
    res = await p;
    expect(await res.text()).toContain("An error occurred. Please try again later.");
    vi.useRealTimers();
  });

  test("falls back to the script's first page when the requested page id is missing", async () => {
    // Dispatch always dials `/api/ivr/{campaignId}/page_1/`, but editor-created
    // scripts use generated page ids (e.g. page_mtugk9ys_1). The first hop must
    // resolve to the real first page instead of erroring (#1730-era #1348).
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    const callData = {
      workspace: "w1",
      campaign_id: 1,
      campaign: {
        script: {
          steps: {
            pages: { page_mtugk9ys_1: { blocks: ["b1"] } },
            blocks: { b1: { id: "b1", type: "say", audioFile: "first page" } },
          },
        },
      },
    };
    vi.mocked(findCallWithCampaignScriptBySid).mockResolvedValueOnce(callData as any);

    const res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    const text = await res.text();
    expect(text).not.toContain("<Redirect>");
    expect(text).toContain("first page");
    expect(text).not.toContain("There was an error in the IVR flow");
  });

  test("returns hangup when campaign_id does not match URL or call is missing", async () => {
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");

    // campaign_id mismatch
    const callData = { workspace: "w1", campaign_id: 2, campaign: { script: { steps: { pages: { page_1: { blocks: ["b1"] } } } } } };
    vi.mocked(findCallWithCampaignScriptBySid).mockResolvedValueOnce(callData as any);
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    expect(await res.text()).toMatch(/hangup/i);

    // call not found
    vi.mocked(findCallWithCampaignScriptBySid).mockResolvedValueOnce(null as any);
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    expect(await res.text()).toMatch(/hangup/i);
  });

  test("uses the AMD verdict before the flow starts: machine drops or hangs up, never redirects (#1864)", async () => {
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId.route");
    const req = (answeredBy: string) => {
      const fd = new FormData();
      fd.set("CallSid", "CA1");
      fd.set("AnsweredBy", answeredBy);
      return new Request("http://x", {
        method: "POST",
        headers: { "x-twilio-signature": "sig" },
        body: fd,
      });
    };
    const script = {
      steps: {
        pages: { page_1: { blocks: ["b1"] } },
        blocks: { b1: { id: "b1", type: "say", audioFile: "human path" } },
      },
    };

    // machine, drop off => hang up with no redirect and no IVR audio. From the
    // operator's view nothing was left, so the call is a No Answer.
    vi.mocked(findCallWithCampaignScriptBySid).mockResolvedValueOnce({
      workspace: "w1",
      campaign_id: 1,
      outreach_attempt_id: 7,
      campaign: { voicemail_drop_enabled: false, voicemail_file: null, script },
    } as never);
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: req("machine_start"),
    } as never);
    let text = await res.text();
    expect(text).toMatch(/hangup/i);
    expect(text).not.toContain("<Redirect>");
    expect(vi.mocked(updateOutreachAttemptForWorkspace)).toHaveBeenNthCalledWith(
      1,
      "w1",
      7,
      { disposition: "no-answer" },
    );

    // machine, drop on => play the drop, still no redirect, recorded as a voicemail
    vi.mocked(findCallWithCampaignScriptBySid).mockResolvedValueOnce({
      workspace: "w1",
      campaign_id: 1,
      outreach_attempt_id: 8,
      campaign: { voicemail_drop_enabled: true, voicemail_file: "vm.mp3", script },
    } as never);
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: req("machine_end_beep"),
    } as never);
    text = await res.text();
    expect(text).toContain("<Play>https://signed</Play>");
    expect(text).not.toContain("<Redirect>");
    expect(vi.mocked(updateOutreachAttemptForWorkspace)).toHaveBeenNthCalledWith(
      2,
      "w1",
      8,
      { disposition: "voicemail", answered_at: expect.any(String) },
    );

    // human => the first block renders inline, no redirect
    vi.mocked(findCallWithCampaignScriptBySid).mockResolvedValueOnce({
      workspace: "w1",
      campaign_id: 1,
      campaign: { voicemail_drop_enabled: false, voicemail_file: null, script },
    } as never);
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: req("human"),
    } as never);
    const humanText = await res.text();
    expect(humanText).not.toContain("<Redirect>");
    expect(humanText).toContain("human path");
  });
});
