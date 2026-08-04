import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  apiKeyActorFromScopes,
  actorHasProductCapability,
  sessionActorFromMembership,
} from "../app/lib/capability-actor.server";
import { capabilityIdsForRole } from "../app/lib/capabilities";

describe("capability actor adapter", () => {
  test("maps owner role to full capability set including audit.read", () => {
    const actor = sessionActorFromMembership({
      userId: "u1",
      workspaceId: "w1",
      role: "owner",
    });
    expect(actor.type).toBe("session");
    expect(actorHasProductCapability(actor, "audit.read")).toBe(true);
    expect(actorHasProductCapability(actor, "calls.start")).toBe(true);
  });

  test("caller role has telephony but not audit.read", () => {
    const actor = sessionActorFromMembership({
      userId: "u1",
      workspaceId: "w1",
      role: "caller",
    });
    expect(actorHasProductCapability(actor, "calls.start")).toBe(true);
    expect(actorHasProductCapability(actor, "calls.control")).toBe(true);
    expect(actorHasProductCapability(actor, "audit.read")).toBe(false);
    expect(capabilityIdsForRole("caller")).not.toContain("audit.read");
  });

  test("unknown role yields empty capabilities", () => {
    const actor = sessionActorFromMembership({
      userId: "u1",
      workspaceId: "w1",
      role: "field_director",
    });
    expect(actor.capabilities.size).toBe(0);
  });

  test("API key scopes are an allowlist; empty denies all", () => {
    const empty = apiKeyActorFromScopes({
      keyId: "k1",
      workspaceId: "w1",
      scopes: [],
    });
    expect(actorHasProductCapability(empty, "calls.start")).toBe(false);

    const dialer = apiKeyActorFromScopes({
      keyId: "k1",
      workspaceId: "w1",
      scopes: ["calls.start"],
    });
    expect(actorHasProductCapability(dialer, "calls.start")).toBe(true);
    expect(actorHasProductCapability(dialer, "calls.control")).toBe(false);
    expect(actorHasProductCapability(dialer, "audit.read")).toBe(false);
  });

  test("ignores unknown scope strings on API keys", () => {
    const actor = apiKeyActorFromScopes({
      keyId: "k1",
      workspaceId: "w1",
      scopes: ["not.a.capability", "messages.send"],
    });
    expect(actorHasProductCapability(actor, "messages.send")).toBe(true);
    expect(actor.capabilities.size).toBe(1);
  });
});

describe("requireDataPlaneCapability", () => {
  const getUserRole = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    getUserRole.mockReset();
  });

  test("denies session actor missing capability", async () => {
    vi.doMock("@/lib/database/workspace.server", () => ({
      getUserRole: (...args: unknown[]) => getUserRole(...args),
    }));
    getUserRole.mockResolvedValue({ role: "caller" });

    const { requireDataPlaneCapability } = await import(
      "../app/lib/capability-guard.server"
    );
    const result = await requireDataPlaneCapability(
      { userId: "u1", workspaceId: "w1" },
      "audit.read",
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  test("denies API key with wrong scopes", async () => {
    vi.doMock("@/lib/database/workspace.server", () => ({
      getUserRole: (...args: unknown[]) => getUserRole(...args),
    }));

    const { requireDataPlaneCapability } = await import(
      "../app/lib/capability-guard.server"
    );
    const result = await requireDataPlaneCapability(
      {
        userId: null,
        workspaceId: "w1",
        apiKey: { keyId: "k1", scopes: ["messages.send"] },
      },
      "calls.start",
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  test("allows API key with matching scope", async () => {
    vi.doMock("@/lib/database/workspace.server", () => ({
      getUserRole: (...args: unknown[]) => getUserRole(...args),
    }));

    const { requireDataPlaneCapability } = await import(
      "../app/lib/capability-guard.server"
    );
    const result = await requireDataPlaneCapability(
      {
        userId: null,
        workspaceId: "w1",
        apiKey: { keyId: "k1", scopes: ["calls.start"] },
      },
      "calls.start",
    );
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.type).toBe("api_key");
    }
  });
});
