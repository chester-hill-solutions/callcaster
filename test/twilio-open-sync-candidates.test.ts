import { describe, expect, test } from "vitest";
import {
  isOpenMessageStatusForSync,
  isOutboundMessageDirectionForSync,
  OPEN_MESSAGE_STATUS_LIST,
  parseTwilioOpenSyncBody,
  staleBeforeIso,
  TWILIO_OPEN_SYNC_MIN_DATE_CREATED,
} from "../supabase/functions/_shared/twilio-open-sync-candidates.ts";
import {
  CALL_STATUSES_BILLABLE_ON_COMPLETION,
  isActiveCallStatusForSync,
  normalizeProviderStatus,
} from "../supabase/functions/_shared/call-provider-status.ts";

describe("twilio-open-sync-candidates", () => {
  test("TWILIO_OPEN_SYNC_MIN_DATE_CREATED is Apr 1 2026 (UTC calendar day)", () => {
    expect(TWILIO_OPEN_SYNC_MIN_DATE_CREATED).toBe("2026-04-01");
  });

  test("parseTwilioOpenSyncBody caps and defaults", () => {
    expect(parseTwilioOpenSyncBody(null)).toEqual({
      callLimit: 100,
      messageLimit: 100,
      maxAgeMinutes: 2,
    });
    expect(
      parseTwilioOpenSyncBody({
        callLimit: 9999,
        messageLimit: "10",
        maxAgeMinutes: -1,
      }),
    ).toEqual({
      callLimit: 250,
      messageLimit: 10,
      maxAgeMinutes: 2,
    });
  });

  test("staleBeforeIso is in the past", () => {
    const iso = staleBeforeIso(5);
    const t = new Date(iso).getTime();
    expect(t).toBeLessThan(Date.now());
  });

  test("isOutboundMessageDirectionForSync", () => {
    expect(isOutboundMessageDirectionForSync("inbound")).toBe(false);
    expect(isOutboundMessageDirectionForSync("outbound-api")).toBe(true);
    expect(isOutboundMessageDirectionForSync(null)).toBe(false);
  });

  test("isOpenMessageStatusForSync", () => {
    expect(isOpenMessageStatusForSync("sent")).toBe(true);
    expect(isOpenMessageStatusForSync("delivered")).toBe(false);
    expect(isOpenMessageStatusForSync("failed")).toBe(false);
    expect(OPEN_MESSAGE_STATUS_LIST).toContain("queued");
  });
});

describe("call-provider-status (edge shared)", () => {
  test("normalizeProviderStatus", () => {
    expect(normalizeProviderStatus("in-progress")).toBe("in-progress");
    expect(normalizeProviderStatus("in_progress")).toBe("in-progress");
    expect(normalizeProviderStatus("no_answer")).toBe("no-answer");
    expect(normalizeProviderStatus("COMPLETED")).toBe("completed");
    expect(normalizeProviderStatus("weird")).toBeNull();
  });

  test("isActiveCallStatusForSync", () => {
    expect(isActiveCallStatusForSync("ringing")).toBe(true);
    expect(isActiveCallStatusForSync("completed")).toBe(false);
  });

  test("CALL_STATUSES_BILLABLE_ON_COMPLETION matches api.call-status set", () => {
    expect(CALL_STATUSES_BILLABLE_ON_COMPLETION.has("completed")).toBe(true);
    expect(CALL_STATUSES_BILLABLE_ON_COMPLETION.has("busy")).toBe(true);
    expect(CALL_STATUSES_BILLABLE_ON_COMPLETION.has("canceled")).toBe(false);
  });
});
