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

describe("throughput-config.server", () => {
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

  test("claim batch size scales with target rate", () => {
    expect(claimBatchSizeForRate(2, 1000)).toBe(2);
    expect(claimBatchSizeForRate(0.5, 1000)).toBe(1);
    expect(claimBatchSizeForRate(25, 1000)).toBe(25);
  });

  test("default SMS MPS by sender class", () => {
    expect(defaultSmsTargetMps("ca_short_code")).toBe(100);
    expect(defaultSmsTargetMps("verified_toll_free")).toBe(3);
    expect(defaultSmsTargetMps("ca_local")).toBe(1);
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
