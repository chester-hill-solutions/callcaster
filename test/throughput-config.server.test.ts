import { describe, expect, test } from "vitest";

import {
  claimBatchSizeForRate,
  configuredDispatcherSmsMps,
  configuredDispatcherVoiceCps,
  defaultSmsTargetMps,
  isBulkSmsSenderMisaligned,
  LEGACY_IVR_PIPELINE_CPS,
  LEGACY_MESSAGE_PIPELINE_MPS,
  twilioAssumedSmsMps,
} from "../app/lib/throughput-config.server";
import { throughputConfigVectors } from "./fixtures/throughput-config-vectors";

describe("throughput-config.server", () => {
  test("golden vectors", () => {
    for (const vector of throughputConfigVectors) {
      switch (vector.id) {
        case "legacy-sms-dispatcher":
        case "parallel-sms-dispatcher":
          expect(
            configuredDispatcherSmsMps(vector.input),
            vector.id,
          ).toBe(vector.expected.configuredDispatcherSmsMps);
          break;
        case "legacy-voice-dispatcher":
        case "parallel-voice-dispatcher":
          expect(
            configuredDispatcherVoiceCps(vector.input),
            vector.id,
          ).toBe(vector.expected.configuredDispatcherVoiceCps);
          break;
        case "claim-batch-low-rate":
        case "claim-batch-at-rate":
        case "claim-batch-capped":
          expect(
            claimBatchSizeForRate(vector.input.rate, vector.input.tickMs),
            vector.id,
          ).toBe(vector.expected.claimBatchSize);
          break;
        case "default-sms-mps-toll-free":
        case "default-sms-mps-short-code":
          expect(
            defaultSmsTargetMps(vector.input.senderClass as never),
            vector.id,
          ).toBe(vector.expected.defaultSmsTargetMps);
          break;
        default:
          break;
      }
    }
  });

  test("legacy dispatcher rates when parallel dispatch is disabled", () => {
    expect(
      configuredDispatcherSmsMps({
        parallelDispatchEnabled: false,
        smsTargetMps: 25,
      }),
    ).toBe(LEGACY_MESSAGE_PIPELINE_MPS);
    expect(
      configuredDispatcherVoiceCps({
        parallelDispatchEnabled: false,
        voiceTargetCps: 10,
      }),
    ).toBe(LEGACY_IVR_PIPELINE_CPS);
  });

  test("parallel dispatcher uses configured targets", () => {
    expect(
      configuredDispatcherSmsMps({
        parallelDispatchEnabled: true,
        smsTargetMps: 3,
      }),
    ).toBe(3);
    expect(
      configuredDispatcherVoiceCps({
        parallelDispatchEnabled: true,
        voiceTargetCps: 5,
      }),
    ).toBe(5);
  });

  test("bulk SMS misalignment warns on CA local at volume", () => {
    expect(isBulkSmsSenderMisaligned("ca_local", 499)).toBe(false);
    expect(isBulkSmsSenderMisaligned("ca_local", 500)).toBe(true);
    expect(isBulkSmsSenderMisaligned("verified_toll_free", 5000)).toBe(false);
  });

  test("twilioAssumedSmsMps scales with sender pool for non-A2P senders", () => {
    expect(
      twilioAssumedSmsMps({
        smsSenderClass: "verified_toll_free",
        trafficClass: "toll_free",
        throughputProduct: "none",
        senderPoolSize: 2,
      }),
    ).toBe(6);
  });
});
