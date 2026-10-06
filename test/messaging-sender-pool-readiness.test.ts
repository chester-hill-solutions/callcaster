import { expect, test } from "vitest";
import { DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE } from "@/lib/messaging-onboarding/normalize.server";
import {
  evaluateWorkspaceReadinessByIds,
  type WorkspaceReadinessSenderPool,
} from "@/lib/messaging-onboarding/predicates";

function results(senderPool: WorkspaceReadinessSenderPool) {
  return evaluateWorkspaceReadinessByIds(
    {
      onboarding: DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      workspaceNumbers: [],
      portalConfig: { sendMode: "messaging_service" },
      senderPool,
    },
    ["sender_pool_in_sync"],
  );
}
test("a missing released sender is named exactly", () => {
  expect(
    results({
      inSync: false,
      missingFromPool: ["+14165550285"],
      extraInPool: [],
      livePhoneNumbers: ["+14165550286"],
    }),
  ).toMatchObject([
    {
      severity: "error",
      message: "Sender pool is missing numbers: +14165550285.",
    },
  ]);
});
test("an unexpected released sender is named exactly", () => {
  expect(
    results({
      inSync: false,
      missingFromPool: [],
      extraInPool: ["+14165550285"],
      livePhoneNumbers: ["+14165550285", "+14165550286"],
    }),
  ).toMatchObject([
    {
      severity: "error",
      message: "Sender pool has unexpected numbers: +14165550285.",
    },
  ]);
});
test("mixed sender drift identifies both missing and unexpected phones", () => {
  expect(
    results({
      inSync: false,
      missingFromPool: ["+14165550286"],
      extraInPool: ["+14165550285"],
      livePhoneNumbers: ["+14165550285"],
    }),
  ).toMatchObject([
    {
      message:
        "Sender pool is missing numbers: +14165550286. Sender pool has unexpected numbers: +14165550285.",
    },
  ]);
});
test("a clean sender pool remains ready", () => {
  expect(
    results({
      inSync: true,
      missingFromPool: [],
      extraInPool: [],
      livePhoneNumbers: ["+14165550286"],
    }),
  ).toEqual([]);
});
