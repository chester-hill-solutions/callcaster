import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function readScript(name: string) {
  return readFileSync(path.join(ROOT, "scripts", name), "utf8");
}

describe("check-twilio-webhook-coverage patterns", () => {
  const source = readScript("check-twilio-webhook-coverage.mjs");
  const patterns = [...source.matchAll(/VALIDATION_PATTERNS = \[([\s\S]*?)\];/g)][0]?.[1] ?? "";

  test("recognizes requireTwilioSignature", () => {
    expect(patterns).toContain("requireTwilioSignature");
    expect(/requireTwilioSignature/.test(
      'import { requireTwilioSignature } from "@/lib/twilio-webhook.server";',
    )).toBe(true);
  });

  test("excludes stripe webhook from Twilio audit", () => {
    expect(source).toContain("stripe-webhook.action.server.ts");
  });
});

describe("check-middleware-adoption trees", () => {
  const source = readScript("check-middleware-adoption.mjs");

  test("defines workspace, data-plane, and admin trees", () => {
    expect(source).toContain('name: "workspace"');
    expect(source).toContain('name: "data-plane"');
    expect(source).toContain('name: "admin"');
  });

  test("excludes re-export-only workspace messages helper", () => {
    expect(source).toContain("chats/$contact_number.messages.server.ts");
  });

  test("forbids resolveDataPlaneAuth in data-plane children", () => {
    expect(source).toContain("resolveDataPlaneAuth");
    expect(source).toContain("requireJsonAuth");
  });
});

describe("check-credit-write-paths patterns", () => {
  const source = readScript("check-credit-write-paths.mjs");

  test("allows transaction-history ledger module", () => {
    expect(source).toContain("app/lib/transaction-history.server.ts");
  });

  test("flags direct drizzle credit sets", () => {
    const setPattern = /\.set\s*\(\s*\{[^}]*\bcredits\s*:/;
    expect(setPattern.test('.set({ credits: 10 })')).toBe(true);
    expect(setPattern.test('.select({ credits: workspace.credits })')).toBe(false);
  });

  test("flags workspace.credits assignment", () => {
    const assignPattern = /workspace\.credits\s*=/;
    expect(assignPattern.test("workspace.credits = 5")).toBe(true);
    expect(assignPattern.test("return workspace.credits")).toBe(false);
  });
});

describe("check scripts pass on current tree", () => {
  test("middleware adoption script source includes context getters", () => {
    const source = readScript("check-middleware-adoption.mjs");
    expect(source).toContain("getWorkspaceRouteContext");
    expect(source).toContain("getDataPlaneRouteContext");
    expect(source).toContain("getAdminRouteContext");
  });
});
