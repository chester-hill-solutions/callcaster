import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  claimBatchSizeForRate,
  configuredDispatcherSmsMps,
  configuredDispatcherVoiceCps,
  normalizePortalThroughputConfig,
} from "../_shared/throughput-config.ts";
import vectors from "../_shared/throughput-config-vectors.json" with { type: "json" };

const LEGACY_IVR_PIPELINE_CPS = 1000 / 700;

function defaultSmsTargetMps(senderClass: string): number {
  switch (senderClass) {
    case "ca_short_code":
      return 100;
    case "verified_toll_free":
      return 3;
    case "us_a2p10dlc":
      return 1;
    case "ca_local":
      return 1;
    default:
      return 1;
  }
}

Deno.test("throughput golden vectors", () => {
  for (const vector of vectors) {
    switch (vector.id) {
      case "legacy-sms-dispatcher":
      case "parallel-sms-dispatcher":
        assertEquals(
          configuredDispatcherSmsMps(vector.input),
          vector.expected.configuredDispatcherSmsMps,
          vector.id,
        );
        break;
      case "legacy-voice-dispatcher":
      case "parallel-voice-dispatcher":
        assertEquals(
          configuredDispatcherVoiceCps(vector.input),
          vector.expected.configuredDispatcherVoiceCps,
          vector.id,
        );
        break;
      case "claim-batch-low-rate":
      case "claim-batch-at-rate":
      case "claim-batch-capped":
        assertEquals(
          claimBatchSizeForRate(vector.input.rate, vector.input.tickMs),
          vector.expected.claimBatchSize,
          vector.id,
        );
        break;
      case "normalize-parallel-explicit-false":
      case "normalize-parallel-explicit-true": {
        const normalized = normalizePortalThroughputConfig({
          portalConfig: vector.input.portalConfig,
        });
        assertEquals(
          normalized.parallelDispatchEnabled,
          vector.expected.parallelDispatchEnabled,
          vector.id,
        );
        assertEquals(normalized.smsTargetMps, vector.expected.smsTargetMps, vector.id);
        break;
      }
      case "default-sms-mps-toll-free":
      case "default-sms-mps-short-code":
        assertEquals(
          defaultSmsTargetMps(vector.input.senderClass),
          vector.expected.defaultSmsTargetMps,
          vector.id,
        );
        break;
      default:
        throw new Error(`Unhandled vector: ${vector.id}`);
    }
  }
});

Deno.test("configuredDispatcherSmsMps stays on legacy pipeline when disabled", () => {
  assertEquals(
    configuredDispatcherSmsMps({
      parallelDispatchEnabled: false,
      smsTargetMps: 50,
    }),
    2,
  );
});

Deno.test("claimBatchSizeForRate returns at least one contact per tick", () => {
  assertEquals(claimBatchSizeForRate(0.2, 1000), 1);
  assertEquals(claimBatchSizeForRate(3, 1000), 3);
});

Deno.test("legacy IVR CPS constant matches shared pipeline", () => {
  assertEquals(LEGACY_IVR_PIPELINE_CPS, configuredDispatcherVoiceCps({
    parallelDispatchEnabled: false,
    voiceTargetCps: 99,
  }));
});
