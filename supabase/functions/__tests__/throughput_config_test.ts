import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  claimBatchSizeForRate,
  configuredDispatcherSmsMps,
  normalizePortalThroughputConfig,
} from "../_shared/throughput-config.ts";

Deno.test("normalizePortalThroughputConfig applies conservative defaults", () => {
  const config = normalizePortalThroughputConfig({});
  assertEquals(config.parallelDispatchEnabled, false);
  assertEquals(config.smsTargetMps, 1);
  assertEquals(config.voiceTargetCps, 1);
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
