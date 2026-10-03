import { describe, expect, test, vi } from "vitest";
import { Twilio } from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import {
  listWorkspaceTollFreeVerificationSummaries,
  tollFreeVerificationBlocksBulkSms,
} from "@/lib/twilio-toll-free.server";

const accountSid = `AC${"1".repeat(32)}`;
const phoneNumberSid = `PN${"2".repeat(32)}`;
const sender = { sid: phoneNumberSid, phoneNumber: "+18885551212" };
function verification(status: string | undefined, sid = phoneNumberSid) {
  return {
    sid: `HH${"3".repeat(32)}`,
    tollfree_phone_number_sid: sid,
    status,
  };
}
function provider(rows: ReturnType<typeof verification>[], nextPage?: ReturnType<typeof verification>[]) {
  const transport = new RequestClient();
  const request = vi.spyOn(transport, "request").mockImplementation(async (args) => {
    const tail = args.uri.includes("PageToken=tail");
    return {
      statusCode: 200,
      headers: {},
      body: JSON.stringify({
        tollfree_verifications: tail ? nextPage : rows,
        meta: {
          key: "tollfree_verifications",
          next_page_url: nextPage && !tail
            ? "https://messaging.twilio.com/v1/Tollfree/Verifications?PageToken=tail"
            : null,
          previous_page_url: null,
          page_size: 200,
          page: tail ? 1 : 0,
          url: args.uri,
        },
      }),
    };
  });
  return { twilio: new Twilio(accountSid, "fixture-token", { httpClient: transport }), request };
}

describe("toll-free verification evidence through the installed SDK", () => {
  test.each([
    { status: "TWILIO_APPROVED", blocked: false },
    { status: "APPROVED", blocked: true },
    { status: "TWILIO_REJECTED", blocked: true },
    { status: "PENDING_REVIEW", blocked: true },
    { status: "IN_REVIEW", blocked: true },
    { status: "not_submitted", blocked: true },
    { status: "unknown", blocked: true },
    { status: undefined, blocked: true },
    { status: "NOT_APPROVED", blocked: true },
    { status: "UNAPPROVED", blocked: true },
  ])("provider status $status has blocked=$blocked", async ({ status, blocked }) => {
    const { twilio } = provider([verification(status)]);
    const summaries = await listWorkspaceTollFreeVerificationSummaries({ twilio, tollFreePhoneNumbers: [sender] });
    expect(tollFreeVerificationBlocksBulkSms(summaries)).toBe(blocked);
  });

  test("no verification record is not submitted and blocks the sender", async () => {
    const { twilio } = provider([]);
    const summaries = await listWorkspaceTollFreeVerificationSummaries({ twilio, tollFreePhoneNumbers: [sender] });
    expect(summaries).toEqual([{ phoneNumber: "+18885551212", phoneNumberSid, status: "not_submitted", rejectionReason: null }]);
    expect(tollFreeVerificationBlocksBulkSms(summaries)).toBe(true);
  });

  test("a provider error stays visible instead of becoming absent evidence", async () => {
    const { twilio, request } = provider([]);
    request.mockRejectedValue(new Error("Verification provider unavailable"));
    await expect(listWorkspaceTollFreeVerificationSummaries({ twilio, tollFreePhoneNumbers: [sender] })).rejects.toThrow("Verification provider unavailable");
  });

  test("the target verification after 200 earlier records controls the decision", async () => {
    const firstPage = Array.from({ length: 200 }, (_, index) => verification("TWILIO_APPROVED", `PN${String(index).padStart(32, "0")}`));
    const { twilio, request } = provider(firstPage, [verification("TWILIO_REJECTED")]);
    const summaries = await listWorkspaceTollFreeVerificationSummaries({ twilio, tollFreePhoneNumbers: [sender] });
    expect(summaries[0].status).toBe("rejected");
    expect(tollFreeVerificationBlocksBulkSms(summaries)).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  test("an approved verification on a later page remains allowed", async () => {
    const firstPage = Array.from({ length: 200 }, (_, index) => verification("TWILIO_APPROVED", `PN${String(index).padStart(32, "0")}`));
    const { twilio } = provider(firstPage, [verification("TWILIO_APPROVED")]);
    const summaries = await listWorkspaceTollFreeVerificationSummaries({ twilio, tollFreePhoneNumbers: [sender] });
    expect(summaries[0].status).toBe("approved");
    expect(tollFreeVerificationBlocksBulkSms(summaries)).toBe(false);
  });
});
