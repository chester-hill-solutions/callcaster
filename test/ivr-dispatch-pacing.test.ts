import { expect, test } from "vitest";
import { configuredDispatcherVoiceCps, ivrDispatchPacing } from "../app/lib/throughput-config";
import { makePortalConfig } from "./fixtures/workspace-twilio-portal-config";

test("the default voice path uses one CPS instead of a legacy webhook delay heuristic (#3007)", () => {
  expect(configuredDispatcherVoiceCps(makePortalConfig())).toBe(1);
});

test.each([
  { cps: 0.1, batchSize: 1, minStartIntervalMs: 10000 },
  { cps: 1, batchSize: 1, minStartIntervalMs: 1000 },
  { cps: 2.5, batchSize: 3, minStartIntervalMs: 400 },
  { cps: 5, batchSize: 5, minStartIntervalMs: 200 },
])("$cps CPS spaces requests within and between rounded batches", ({ cps, batchSize, minStartIntervalMs }) => {
  expect(ivrDispatchPacing(makePortalConfig({ parallelDispatchEnabled: true, voiceTargetCps: cps })))
    .toEqual({ batchSize, minStartIntervalMs });
});
