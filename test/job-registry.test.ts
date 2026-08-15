import { describe, expect, test } from "vitest";
import {
  jobHandlers,
  jobRegistry,
  PAGING_JOB_TYPES,
  SELF_SCHEDULING_JOB_TYPES,
  SELF_SCHEDULING_SEED_PARAMS,
} from "@/lib/worker/handlers.server";

/**
 * Drift guard for #1239 A1: `jobHandlers`, `PAGING_JOB_TYPES`, and
 * `SELF_SCHEDULING_JOB_TYPES` are now DERIVED from the `jobRegistry` list in
 * handlers.server.ts instead of being hand-maintained independently. These
 * tests pin them to the exact sets that existed before the registry
 * landed — a snapshot of what poll-jobs.server.ts's `PAGING_JOB_TYPES` and
 * ensure-scheduled-jobs.server.ts's `SELF_SCHEDULING_JOB_TYPES` used to
 * hardcode. If this test needs to change, it means a job type's paging or
 * scheduling behaviour changed, not just its registration mechanism — that
 * should be a deliberate, reviewed diff, not silent drift between the lists
 * this registry replaced.
 */

// The exact `jobHandlers` key set that existed in handlers.server.ts before
// the registry landed (job-types.server.ts constants + bare string literals).
const EXPECTED_JOB_TYPES = [
  "twilio_open_sync",
  "workspace_twilio_compliance",
  "billing_reconcile",
  "campaign_schedule_sync",
  "number_rental_billing",
  "audience_upload",
  "low_credit_notify",
  "twilio_webhook_audit",
  "call_status_side_effects",
  "sms_status_side_effects",
  "recording_side_effects",
  "campaign_export",
  "campaign_dispatch",
  "webhook_delivery",
  "elevenlabs_batch_transcribe",
].sort();

// The exact set poll-jobs.server.ts hand-maintained as `PAGING_JOB_TYPES`.
const EXPECTED_PAGING_JOB_TYPES = [
  "call_status_side_effects",
  "sms_status_side_effects",
  "billing_reconcile",
  "number_rental_billing",
  "workspace_twilio_compliance",
].sort();

// The exact set ensure-scheduled-jobs.server.ts hand-maintained as
// `SELF_SCHEDULING_JOB_TYPES`.
const EXPECTED_SELF_SCHEDULING_JOB_TYPES = [
  "low_credit_notify",
  "twilio_webhook_audit",
  "twilio_open_sync",
  "billing_reconcile",
  "number_rental_billing",
  "campaign_schedule_sync",
].sort();

// The exact seed params map ensure-scheduled-jobs.server.ts hand-maintained
// (only twilio_open_sync had non-empty seed params; every other
// self-scheduling type seeded with `{}`).
const EXPECTED_SEED_PARAMS: Record<string, Record<string, unknown>> = {
  low_credit_notify: {},
  twilio_webhook_audit: {},
  twilio_open_sync: { callLimit: 50, messageLimit: 50, maxAgeMinutes: 120 },
  billing_reconcile: {},
  number_rental_billing: {},
  campaign_schedule_sync: {},
};

describe("job registry — derived-set equality guard (#1239 A1)", () => {
  test("jobRegistry has exactly one entry per job type (no duplicates, no gaps)", () => {
    const types = jobRegistry.map((registration) => registration.type);
    expect(new Set(types).size).toBe(types.length);
    expect([...types].sort()).toEqual(EXPECTED_JOB_TYPES);
  });

  test("jobHandlers keys match the hand-maintained object literal it replaced", () => {
    expect(Object.keys(jobHandlers).sort()).toEqual(EXPECTED_JOB_TYPES);
  });

  test("every jobHandlers entry is callable", () => {
    for (const type of EXPECTED_JOB_TYPES) {
      expect(typeof jobHandlers[type]).toBe("function");
    }
  });

  test("PAGING_JOB_TYPES matches poll-jobs.server.ts's former hardcoded set", () => {
    expect([...PAGING_JOB_TYPES].sort()).toEqual(EXPECTED_PAGING_JOB_TYPES);
  });

  test("SELF_SCHEDULING_JOB_TYPES matches ensure-scheduled-jobs.server.ts's former hardcoded set", () => {
    expect([...SELF_SCHEDULING_JOB_TYPES].sort()).toEqual(
      EXPECTED_SELF_SCHEDULING_JOB_TYPES,
    );
  });

  test("SELF_SCHEDULING_SEED_PARAMS matches ensure-scheduled-jobs.server.ts's former hardcoded map", () => {
    for (const type of EXPECTED_SELF_SCHEDULING_JOB_TYPES) {
      expect(SELF_SCHEDULING_SEED_PARAMS[type]).toEqual(EXPECTED_SEED_PARAMS[type]);
    }
    expect(Object.keys(SELF_SCHEDULING_SEED_PARAMS).sort()).toEqual(
      EXPECTED_SELF_SCHEDULING_JOB_TYPES,
    );
  });
});

describe("job registry — defineJob params validation (proof migrations)", () => {
  test("twilio_open_sync defaults missing/invalid numeric params exactly like the old requireNumberParam helper", async () => {
    const registration = jobRegistry.find((r) => r.type === "twilio_open_sync");
    expect(registration).toBeDefined();

    // Missing params -> defaults (50, 50, 120), matching the old `?? 50` etc.
    expect(registration!.params.parse({})).toEqual({
      callLimit: 50,
      messageLimit: 50,
      maxAgeMinutes: 120,
    });

    // Numeric-string params coerce, matching requireNumberParam's tenant-db
    // bigint-as-string handling (#1078).
    expect(
      registration!.params.parse({ callLimit: "10", messageLimit: "20", maxAgeMinutes: "30" }),
    ).toEqual({ callLimit: 10, messageLimit: 20, maxAgeMinutes: 30 });

    // Garbage falls back to default rather than throwing, matching the old
    // `requireNumberParam(...) ?? default` behaviour.
    expect(registration!.params.parse({ callLimit: "not-a-number" })).toEqual({
      callLimit: 50,
      messageLimit: 50,
      maxAgeMinutes: 120,
    });
  });

  test("elevenlabs_batch_transcribe rejects a missing callSid with the original error message", () => {
    const registration = jobRegistry.find(
      (r) => r.type === "elevenlabs_batch_transcribe",
    );
    expect(registration).toBeDefined();
    expect(() => registration!.params.parse({})).toThrowError(
      "elevenlabs_batch_transcribe: missing callSid",
    );
    expect(registration!.params.parse({ callSid: "CA123" })).toEqual({
      callSid: "CA123",
    });
  });

  test("billing_reconcile accepts an optional workspaceId and ignores unknown keys", () => {
    const registration = jobRegistry.find((r) => r.type === "billing_reconcile");
    expect(registration).toBeDefined();
    expect(registration!.params.parse({})).toEqual({});
    expect(
      registration!.params.parse({ workspaceId: "ws_1", requestId: "req_1" }),
    ).toEqual({ workspaceId: "ws_1" });
  });
});
