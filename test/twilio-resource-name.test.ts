import { describe, expect, test } from "vitest";

import {
  MAX_TWILIO_FRIENDLY_NAME_LENGTH,
  workspaceResourceName,
} from "../app/lib/twilio-resource-name";

const WS = "6aff2ab3-8a7a-48b2-92e6-f86ec7441ca0";

describe("workspaceResourceName", () => {
  test("uses the workspace name with a short id suffix", () => {
    expect(workspaceResourceName("Civic Action", WS)).toBe("Civic Action · 6aff2ab3");
  });

  test("two workspaces sharing a name stay distinguishable", () => {
    const a = workspaceResourceName("Civic Action", WS);
    const b = workspaceResourceName("Civic Action", "aaaaaaa1-0000-4000-8000-000000000000");
    expect(a).not.toBe(b);
  });

  test("falls back to the uuid when the name is missing or blank", () => {
    expect(workspaceResourceName(null, WS)).toBe(WS);
    expect(workspaceResourceName(undefined, WS)).toBe(WS);
    expect(workspaceResourceName("", WS)).toBe(WS);
    expect(workspaceResourceName("   ", WS)).toBe(WS);
  });

  /**
   * Kill-check for the fallback. If the fallback ever produced a bare suffix
   * (` · 6aff2ab3`) the console would show a nameless row, and the test above
   * would still pass because the uuid appears either way.
   */
  test("a blank name never produces a name that starts with the separator", () => {
    for (const blank of [null, undefined, "", "   ", "\t\n"]) {
      expect(workspaceResourceName(blank, WS).startsWith(" · ")).toBe(false);
    }
  });

  test("collapses whitespace so a pasted name is not doubled up", () => {
    expect(workspaceResourceName("Civic   Action", WS)).toBe("Civic Action · 6aff2ab3");
    expect(workspaceResourceName("  Civic Action  ", WS)).toBe("Civic Action · 6aff2ab3");
  });

  test("strips control characters, which Twilio rejects", () => {
    const name = `Civic\u0000Action\u0007Bell`;
    expect(workspaceResourceName(name, WS)).toBe("CivicActionBell · 6aff2ab3");
  });

  /**
   * 160 is Twilio's documented friendly-name limit, stated here as a literal
   * rather than read back from the module. `MAX_TWILIO_FRIENDLY_NAME_LENGTH`
   * is separately asserted below, so a changed constant still fails a test —
   * it just fails a different one.
   */
  const TWILIO_LIMIT = 160;

  test("truncates a long name but always keeps the id suffix", () => {
    const name = "A".repeat(400);
    const result = workspaceResourceName(name, WS);

    expect(result.length).toBeLessThanOrEqual(TWILIO_LIMIT);
    expect(result.endsWith(" · 6aff2ab3")).toBe(true);
  });

  test("the module's exported limit is Twilio's documented 160", () => {
    expect(MAX_TWILIO_FRIENDLY_NAME_LENGTH).toBe(TWILIO_LIMIT);
  });

  test("does not truncate a name that just fits", () => {
    // The suffix is ` · ` + an 8-char id prefix = 11 characters, so a
    // 149-char name lands exactly on the limit.
    const suffix = " · 6aff2ab3";
    const name = "A".repeat(TWILIO_LIMIT - suffix.length);
    const result = workspaceResourceName(name, WS);

    expect(result).toBe(`${name}${suffix}`);
    expect(result.length).toBe(TWILIO_LIMIT);
  });

  test("stays within budget when the name needs trimming at the boundary", () => {
    const name = "A".repeat(200);
    const result = workspaceResourceName(name, WS);
    expect(result.length).toBeLessThanOrEqual(TWILIO_LIMIT);
  });

  test("survives a name that trims away to nothing at the budget boundary", () => {
    // 148 chars of name, then padding whitespace past the cut. The trimmed
    // slice is all whitespace, so `trimEnd()` empties it and the naive
    // implementation would return ` · 6aff2ab3`.
    const name = `${"A".repeat(147)}  ${" ".repeat(80)}`;
    const result = workspaceResourceName(name, WS);

    expect(result.startsWith(" · ")).toBe(false);
    expect(result.endsWith(" · 6aff2ab3")).toBe(true);
  });

  test("handles a missing workspace id without emitting a dangling separator", () => {
    const result = workspaceResourceName("Civic Action", "");
    expect(result).toBe("Civic Action");
  });

  test("returns a usable label when both name and id are unusable", () => {
    expect(workspaceResourceName("", "")).toBe("Workspace");
    expect(workspaceResourceName("   ", "  ")).toBe("Workspace");
  });
});
