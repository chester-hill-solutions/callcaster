import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/**
 * #2133: the workspace SSE stream admitted any workspace API key, including one
 * minted with **zero** scopes, and the published surface said `session`.
 *
 * Two things are asserted here, and the second is the one the issue got wrong.
 *
 * 1. The stream is gated on a capability. A behavioural test cannot prove this
 *    cheaply — the loader returns a `ReadableStream` and the gate lives in the
 *    `auth` strategy — so the assertion is on the route's own source.
 *
 * 2. The surface guard **can** fail on an auth-class mismatch. The issue claims
 *    the guard accepted a declared `"session"` on a route whose context admits
 *    `apiKeyOrSession`. It did not: the guard was silent because the route's
 *    auth strategy derived *nothing*, and the helper's `allows` list claimed
 *    `session` was possible. The guard was consistent with a wrong `allows`
 *    entry. A guard that cannot detect a lie is not a guard, so that case gets
 *    its own test below.
 */
const EVENT_ROUTE =
  "app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts";
const ANNOTATIONS = "app/lib/api-surface-annotations.ts";
const DERIVE = "scripts/lib/api-surface-derive.mjs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("workspace SSE stream is gated on a capability (#2133)", () => {
  test("the loader gates on audit.read, not a bare data-plane preamble", () => {
    const source = read(EVENT_ROUTE);

    // `getDataPlaneRouteContext` only checks that the actor belongs to the
    // workspace, so a zero-scope key passed it. The capability is the gate.
    expect(source).toMatch(/auth:\s*dataPlaneCapabilityAuth\(\s*"audit\.read"\s*\)/);
    expect(source).not.toMatch(/auth:\s*\(\{[^}]*\}\)\s*=>\s*getDataPlaneRouteContext/);
  });

  test("the loader declares exactly one auth strategy", () => {
    // A second `auth:` on the same loader would shadow the gate depending on
    // merge order — the exact shape of the original defect, reintroduced.
    //
    // Scoped to the `defineLoader({ ... })` call. An earlier version matched
    // every `auth:` in the file with a negative lookahead for a type name, and
    // the `\s*` before it backtracked to satisfy the lookahead — so the guard
    // counted the `streamWorkspaceEvents` parameter annotation as a second
    // strategy and failed on correct code. Scoping to the call is both simpler
    // and actually about the thing being asserted.
    const source = read(EVENT_ROUTE);
    const loader = source.slice(
      source.indexOf("export const loader = defineLoader({"),
      source.indexOf("});", source.indexOf("export const loader = defineLoader({")),
    );
    expect(loader).toBeTruthy();
    const strategies = loader.match(/(?:^|[\s{,])auth:/g) ?? [];
    expect(strategies).toHaveLength(1);
  });

  test("the annotation no longer declares an auth class the code does not enforce", () => {
    // `dataPlaneCapabilityAuth` derives `apiKeyOrSession` authoritatively, and
    // the guard rejects a declaration alongside one. Declaring `session` here is
    // the drift the issue describes: it told operators the key could not work.
    const annotation = read(ANNOTATIONS);
    const line = annotation
      .split("\n")
      .find((l) => l.includes("workspaces+/$workspaceId/events.route.tsx"));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/authClass:/);
  });

  test("the annotation records why audit.read is required", () => {
    // The note is the only place a future reader learns the payload carries
    // transcripts. The route comment says it; the annotation is what shows up in
    // the generated inventory an operator reads.
    const line = read(ANNOTATIONS)
      .split("\n")
      .find((l) => l.includes("workspaces+/$workspaceId/events.route.tsx"));
    expect(line).toMatch(/audit\.read/);
    expect(line).toMatch(/transcript/i);
  });
});

describe("the derive rule no longer claims a helper enforces more than it does (#2133)", () => {
  test("getDataPlaneRouteContext is not listed as permitting only session actors", () => {
    // The rule's own comment said the preamble "requires userId, so
    // session-or-stronger". It does not require userId — it only checks the
    // workspace matches. An `allows` list asserting `session` is therefore a
    // claim the helper never enforced, and it is what let a declared `session`
    // pass unchallenged.
    const source = read(DERIVE);
    const rule = source.slice(
      source.indexOf('id: "getDataPlaneRouteContext"'),
      source.indexOf('id: "requireDataPlaneWorkspaceUser"'),
    );
    expect(rule).toBeTruthy();
    expect(rule).not.toMatch(
      /allows:\s*\[\s*"session"\s*,\s*"workspaceAdmin"\s*\]/,
    );
  });

  test("the misleading claim about userId is gone from the rule's comment", () => {
    // A comment that asserts a guarantee the helper does not provide is worse
    // than no comment: it is what a future author trusts.
    const source = read(DERIVE);
    const start = source.indexOf('id: "getDataPlaneRouteContext"');
    const rule = source.slice(start, start + 400);
    expect(rule).not.toMatch(/requires userId/);
  });
});
