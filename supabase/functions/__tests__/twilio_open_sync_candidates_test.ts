import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isOpenMessageStatusForSync,
  isOutboundMessageDirectionForSync,
  OPEN_MESSAGE_STATUS_LIST,
  parseTwilioOpenSyncBody,
  staleBeforeIso,
  TWILIO_OPEN_SYNC_MIN_DATE_CREATED,
} from "../_shared/twilio-open-sync-candidates.ts";

Deno.test("TWILIO_OPEN_SYNC_MIN_DATE_CREATED is Apr 1 2026", () => {
  assertEquals(TWILIO_OPEN_SYNC_MIN_DATE_CREATED, "2026-04-01");
});

Deno.test("parseTwilioOpenSyncBody caps and defaults", () => {
  assertEquals(parseTwilioOpenSyncBody(null), {
    callLimit: 100,
    messageLimit: 100,
    maxAgeMinutes: 2,
  });
  assertEquals(
    parseTwilioOpenSyncBody({
      callLimit: 9999,
      messageLimit: "10",
      maxAgeMinutes: -1,
    }),
    {
      callLimit: 250,
      messageLimit: 10,
      maxAgeMinutes: 2,
    },
  );
});

Deno.test("staleBeforeIso is in the past", () => {
  const iso = staleBeforeIso(5);
  assertEquals(new Date(iso).getTime() < Date.now(), true);
});

Deno.test("isOutboundMessageDirectionForSync", () => {
  assertEquals(isOutboundMessageDirectionForSync("inbound"), false);
  assertEquals(isOutboundMessageDirectionForSync("outbound-api"), true);
  assertEquals(isOutboundMessageDirectionForSync(null), false);
});

Deno.test("isOpenMessageStatusForSync", () => {
  assertEquals(isOpenMessageStatusForSync("sent"), true);
  assertEquals(isOpenMessageStatusForSync("delivered"), false);
  assertEquals(isOpenMessageStatusForSync("failed"), false);
  assertEquals(OPEN_MESSAGE_STATUS_LIST.includes("queued"), true);
});
