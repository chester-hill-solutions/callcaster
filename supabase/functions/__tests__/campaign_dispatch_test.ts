import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  resolveClaimLimit,
  resolveDispatchMode,
  resolveIvrClaimLimit,
} from "../_shared/campaign-dispatch.ts";

Deno.test("resolveDispatchMode reflects parallelDispatchEnabled", () => {
  assertEquals(
    resolveDispatchMode({
      smsSenderClass: "unknown",
      smsTargetMps: 1,
      voiceTargetCps: 1,
      voiceConcurrentCallLimit: 100,
      parallelDispatchEnabled: false,
    }),
    "legacy",
  );
  assertEquals(
    resolveDispatchMode({
      smsSenderClass: "verified_toll_free",
      smsTargetMps: 3,
      voiceTargetCps: 1,
      voiceConcurrentCallLimit: 100,
      parallelDispatchEnabled: true,
    }),
    "parallel",
  );
});

Deno.test("resolveClaimLimit scales SMS and voice batches", () => {
  const parallelConfig = {
    smsSenderClass: "verified_toll_free" as const,
    smsTargetMps: 3,
    voiceTargetCps: 2,
    voiceConcurrentCallLimit: 100,
    parallelDispatchEnabled: true,
  };

  assertEquals(
    resolveClaimLimit({ campaignType: "message", config: parallelConfig }),
    3,
  );
  assertEquals(
    resolveClaimLimit({ campaignType: "robocall", config: parallelConfig }),
    2,
  );
  assertEquals(
    resolveClaimLimit({ campaignType: "live", config: parallelConfig }),
    1,
  );
});

Deno.test("resolveIvrClaimLimit respects concurrency headroom", () => {
  const config = {
    smsSenderClass: "unknown" as const,
    smsTargetMps: 1,
    voiceTargetCps: 5,
    voiceConcurrentCallLimit: 100,
    parallelDispatchEnabled: true,
  };

  assertEquals(
    resolveIvrClaimLimit({ config, activeCalls: 99 }),
    1,
  );
  assertEquals(
    resolveIvrClaimLimit({ config, activeCalls: 100 }),
    0,
  );
});
