import { expect, test } from "vitest";
import { verifyNodeShards } from "../scripts/verify-node-shards.mjs";

const inventory = [
  { file: "test/auth.test.ts" },
  { file: "test/billing.test.ts" },
];
const auth = {
  success: true,
  numTotalTests: 3,
  numPassedTests: 3,
  testResults: [{ name: "test/auth.test.ts" }],
};
const billing = {
  success: true,
  numTotalTests: 5,
  numPassedTests: 5,
  testResults: [{ name: "test/billing.test.ts" }],
};

test("accepts a complete split of the configured file inventory", () => {
  expect(verifyNodeShards(inventory, [auth, billing])).toEqual({
    files: 2,
    tests: 8,
  });
});

test("rejects a missing shard even when the other shard passed", () => {
  expect(() => verifyNodeShards(inventory, [auth])).toThrow(
    "Both Node shard reports",
  );
});

test("rejects a test file omitted from two otherwise passing shards", () => {
  expect(() =>
    verifyNodeShards(
      [...inventory, { file: "test/worker.test.ts" }],
      [auth, billing],
    ),
  ).toThrow("omitted 1 file");
});

test("rejects duplicate execution that could hide an omitted file", () => {
  expect(() => verifyNodeShards(inventory, [auth, auth])).toThrow(
    "multiple shards",
  );
});

test("rejects a passing report from outside the configured suite", () => {
  expect(() =>
    verifyNodeShards([{ file: "test/auth.test.ts" }], [auth, billing]),
  ).toThrow("Unexpected test file");
});

test("rejects failed and empty runs instead of trusting their file names", () => {
  expect(() =>
    verifyNodeShards(inventory, [auth, { ...billing, success: false }]),
  ).toThrow("complete successfully");
  expect(() =>
    verifyNodeShards(inventory, [auth, { ...billing, numTotalTests: 0 }]),
  ).toThrow("executed tests");
  expect(() =>
    verifyNodeShards(inventory, [auth, { ...billing, numPassedTests: 0 }]),
  ).toThrow("executed tests");
});

test("rejects an empty full-suite inventory", () => {
  expect(() => verifyNodeShards([], [auth, billing])).toThrow(
    "inventory is empty",
  );
});
