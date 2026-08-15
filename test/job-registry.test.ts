import { describe, expect, test } from "vitest";
import {
  enqueueRegisteredJob,
  jobHandlers,
  jobRegistry,
  PAGING_JOB_TYPES,
  requeueStoredJob,
  SELF_SCHEDULING_JOB_TYPES,
  SELF_SCHEDULING_SEED_PARAMS,
  validateStoredJobParams,
} from "@/lib/worker/handlers.server";
import { jobParamsRegistry } from "@/lib/worker/job-params.server";

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

describe("job registry — defineJob params validation (#1239 A2 migrations)", () => {
  test("audience_upload rejects a coerced-zero uploadId/audienceId like the old bundled falsy check", () => {
    const registration = jobRegistry.find((r) => r.type === "audience_upload");
    expect(registration).toBeDefined();

    // 0 is falsy in JS — the old `if (!uploadId || !audienceId || ...) throw`
    // treated a coerced 0 as "missing", same as an absent field.
    expect(() => registration!.params.parse({ uploadId: 0, audienceId: 5 })).toThrowError(
      "audience_upload: missing or invalid uploadId",
    );
    expect(() => registration!.params.parse({ uploadId: 5, audienceId: "not-a-number" })).toThrowError(
      "audience_upload: missing or invalid audienceId",
    );

    // Numeric-string ids coerce (tenant-db bigint-as-string, #1078); optional
    // fields fall back exactly like the old `typeof` narrowing.
    expect(
      registration!.params.parse({ uploadId: "12", audienceId: "34" }),
    ).toEqual({
      uploadId: 12,
      audienceId: 34,
      workspaceId: undefined,
      userId: undefined,
      fileContent: "",
      headerMapping: {},
      splitNameColumn: null,
      voterListSource: null,
    });

    // voterListSource is NOT enum-validated (deliberately looser — see
    // legacyNullableStringParam's doc comment): an out-of-enum string that
    // the old blind cast would have accepted must still pass.
    expect(
      registration!.params.parse({
        uploadId: 1,
        audienceId: 2,
        voterListSource: "not_a_real_source",
        headerMapping: ["array", "not", "object"],
      }).voterListSource,
    ).toBe("not_a_real_source");
    expect(
      registration!.params.parse({ uploadId: 1, audienceId: 2, headerMapping: ["a", "b"] })
        .headerMapping,
    ).toEqual(["a", "b"]);
  });

  test("call/sms/recording side-effect job types share one schema factory and reject the same shapes requireSidAndTwilioParams did", () => {
    const callStatus = jobRegistry.find((r) => r.type === "call_status_side_effects");
    const smsStatus = jobRegistry.find((r) => r.type === "sms_status_side_effects");
    const recording = jobRegistry.find((r) => r.type === "recording_side_effects");
    expect(callStatus).toBeDefined();
    expect(smsStatus).toBeDefined();
    expect(recording).toBeDefined();

    expect(() => callStatus!.params.parse({})).toThrowError(
      "call_status_side_effects: missing callSid or twilioParams",
    );
    expect(() => smsStatus!.params.parse({ messageSid: "SM1" })).toThrowError(
      "sms_status_side_effects: missing messageSid or twilioParams",
    );
    expect(() => recording!.params.parse({ callSid: "CA1", twilioParams: "not-an-object" })).toThrowError(
      "recording_side_effects: missing callSid or twilioParams",
    );

    // A row queued for call_status_side_effects only ever has `callSid` set;
    // a stray `messageSid` from an unrelated job shape must be ignored, same
    // as the old code reading only `params[sidKey]`.
    expect(
      callStatus!.params.parse({
        callSid: "CA1",
        messageSid: "SM_should_be_ignored",
        twilioParams: { CallStatus: "completed" },
      }),
    ).toEqual({ sid: "CA1", twilioParams: { CallStatus: "completed" } });
  });

  test("webhook_delivery requires a valid eventType and rejects the same falsy payload/eventCategory the old bundled check did", () => {
    const registration = jobRegistry.find((r) => r.type === "webhook_delivery");
    expect(registration).toBeDefined();

    expect(() =>
      registration!.params.parse({
        eventCategory: "call",
        eventType: "DELETE",
        payload: { a: 1 },
      }),
    ).toThrow();
    expect(() =>
      registration!.params.parse({ eventCategory: "call", eventType: "INSERT" }),
    ).toThrowError("webhook_delivery: missing payload");
    expect(() =>
      registration!.params.parse({ eventType: "INSERT", payload: { a: 1 } }),
    ).toThrowError("webhook_delivery: missing eventCategory");

    expect(
      registration!.params.parse({
        eventCategory: "call",
        eventType: "UPDATE",
        payload: { a: 1 },
      }),
    ).toEqual({
      workspaceId: undefined,
      eventCategory: "call",
      eventType: "UPDATE",
      payload: { a: 1 },
      optional: false,
    });
  });

  test("campaign_export and campaign_dispatch reject a coerced-zero campaignId like the old falsy check, but accept negative ids", () => {
    const exportReg = jobRegistry.find((r) => r.type === "campaign_export");
    const dispatchReg = jobRegistry.find((r) => r.type === "campaign_dispatch");
    expect(exportReg).toBeDefined();
    expect(dispatchReg).toBeDefined();

    expect(() =>
      exportReg!.params.parse({ campaignId: 0, exportId: "exp_1", campaignType: "message" }),
    ).toThrowError("campaign_export: missing or invalid campaignId");
    expect(() => dispatchReg!.params.parse({ campaignId: 0 })).toThrowError(
      "campaign_dispatch: missing or invalid campaignId",
    );

    // Negative numbers are truthy in JS, so the old `!campaignId` check never
    // rejected them — only an exact falsy 0 (or a non-numeric value).
    expect(dispatchReg!.params.parse({ campaignId: -5 }).campaignId).toBe(-5);
  });
});

/**
 * Drift guard for #1239 A3: `job-params.server.ts`'s `jobParamsRegistry`
 * (schema-only, importable by handler-implementation files without a module
 * cycle back through `handlers.server.ts` — see that module's doc comment)
 * must register exactly the same job types as `handlers.server.ts`'s
 * `jobRegistry` (schema + handler + paging/schedule). If a job type is added
 * to one list without the other, `enqueueRegisteredJob` and the dequeue-side
 * `jobHandlers` would silently disagree about what's a valid job type.
 */
describe("job registry — enqueue-side/dequeue-side registry parity (#1239 A3)", () => {
  test("jobParamsRegistry and jobRegistry register exactly the same set of job types", () => {
    const enqueueSideTypes = jobParamsRegistry.map((entry) => entry.type).sort();
    const dequeueSideTypes = jobRegistry.map((registration) => registration.type).sort();
    expect(enqueueSideTypes).toEqual(dequeueSideTypes);
  });

  test("jobParamsRegistry and jobRegistry validate each type against the exact same schema instance", () => {
    for (const entry of jobParamsRegistry) {
      const registration = jobRegistry.find((r) => r.type === entry.type);
      expect(registration).toBeDefined();
      expect(registration!.params).toBe(entry.params);
    }
  });
});

/**
 * `requeueStoredJob`/`validateStoredJobParams` are the sanctioned escape
 * hatch for enqueue sites that can't pin one job type at compile time (a
 * dead-letter requeue can be any type; `ensure-scheduled-jobs.server.ts`'s
 * boot seed iterates every self-scheduling type) — see their doc comments in
 * job-registry.server.ts. Both must reject an unknown type with a typed
 * error instead of enqueueing garbage or throwing.
 */
describe("job registry — requeue/validate escape hatch (#1239 A3)", () => {
  test("validateStoredJobParams rejects an unregistered job type", () => {
    const result = validateStoredJobParams("not_a_real_job_type", {});
    expect(result).toEqual({
      ok: false,
      error: 'No defineJob registration for job type "not_a_real_job_type"',
    });
  });

  test("validateStoredJobParams rejects params that fail the matched type's schema", () => {
    const result = validateStoredJobParams("audience_upload", { uploadId: 0, audienceId: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/audience_upload: missing or invalid uploadId/);
    }
  });

  test("validateStoredJobParams accepts valid stored params for a registered type", () => {
    const result = validateStoredJobParams("billing_reconcile", { workspaceId: "ws_1" });
    expect(result).toEqual({
      ok: true,
      type: "billing_reconcile",
      params: { workspaceId: "ws_1" },
    });
  });

  test("requeueStoredJob rejects an unregistered job type without calling enqueueJob", async () => {
    const result = await requeueStoredJob("not_a_real_job_type", {});
    expect(result).toEqual({
      ok: false,
      error: 'No defineJob registration for job type "not_a_real_job_type"',
    });
  });

  test("enqueueRegisteredJob is exported and callable for a known type (compile-time narrowing smoke test)", () => {
    expect(typeof enqueueRegisteredJob).toBe("function");
  });
});
