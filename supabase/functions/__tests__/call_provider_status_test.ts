import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CALL_STATUSES_BILLABLE_ON_COMPLETION,
  isActiveCallStatusForSync,
  normalizeProviderStatus,
} from "../_shared/call-provider-status.ts";

Deno.test("normalizeProviderStatus maps variants and rejects unknown", () => {
  assertEquals(normalizeProviderStatus("in-progress"), "in-progress");
  assertEquals(normalizeProviderStatus("in_progress"), "in-progress");
  assertEquals(normalizeProviderStatus("no_answer"), "no-answer");
  assertEquals(normalizeProviderStatus("COMPLETED"), "completed");
  assertEquals(normalizeProviderStatus(null), null);
  assertEquals(normalizeProviderStatus(""), null);
  assertEquals(normalizeProviderStatus("weird"), null);
});

Deno.test("isActiveCallStatusForSync distinguishes active vs terminal", () => {
  assertEquals(isActiveCallStatusForSync("ringing"), true);
  assertEquals(isActiveCallStatusForSync("completed"), false);
  assertEquals(isActiveCallStatusForSync(null), false);
});

Deno.test("CALL_STATUSES_BILLABLE_ON_COMPLETION excludes canceled", () => {
  assertEquals(CALL_STATUSES_BILLABLE_ON_COMPLETION.has("completed"), true);
  assertEquals(CALL_STATUSES_BILLABLE_ON_COMPLETION.has("busy"), true);
  assertEquals(CALL_STATUSES_BILLABLE_ON_COMPLETION.has("canceled"), false);
});
