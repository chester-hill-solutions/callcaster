import { describe, expect, it } from "vitest";

import { mergeLiveEnvironmentNames } from "../scripts/lib/live-environments.mjs";
import {
  assertEnvironmentPrunable,
  assertPrunable,
  buildTwilioPruneReport,
  classifyTwilioResource,
  environmentNameForResource,
  workspaceOwnerHintForResource,
  workspaceOwnerPrefix,
} from "../scripts/lib/twilio-resource-prune-policy.mjs";
import {
  TWILIO_PRUNE_KEEP,
  TWILIO_PRUNE_KEEP_NAMES,
  TWILIO_PRUNE_KEEP_OWNER_PREFIXES,
  TWILIO_PRUNE_KEEP_PHONE_NUMBERS,
  TWILIO_PRUNE_KEEP_SIDS,
} from "../scripts/twilio-resource-prune-keep-list.mjs";

const DEAD_PREVIEW = "callcaster-pr-1047";
const LIVE_PREVIEW = "callcaster-pr-2001";
const KNOWN_WORKSPACE_ID = "701582c0-4af4-451f-a53b-454de7738bbb";

describe("environmentNameForResource", () => {
  it("reads the environment out of an environment resource name", () => {
    expect(environmentNameForResource("env:callcaster-pr-1047")).toBe("callcaster-pr-1047");
    expect(environmentNameForResource("env:dev")).toBe("dev");
  });

  it("rejects names that are not environment resource names", () => {
    expect(environmentNameForResource("env:")).toBeNull();
    expect(environmentNameForResource("env:callcaster pr 1047")).toBeNull();
    expect(environmentNameForResource("Acme Clinic · 701582c0")).toBeNull();
    expect(environmentNameForResource(null)).toBeNull();
  });
});

describe("workspaceOwnerHintForResource", () => {
  it("reads the owner hint out of a workspace resource name", () => {
    expect(workspaceOwnerHintForResource("Acme Clinic · 701582c0")).toBe("701582c0");
    expect(workspaceOwnerHintForResource("Acme Clinic · 701582C0")).toBe("701582c0");
  });

  it("returns null when the name carries no owner hint", () => {
    expect(workspaceOwnerHintForResource("Acme Clinic")).toBeNull();
    expect(workspaceOwnerHintForResource("Acme Clinic · notahexvalue")).toBeNull();
    expect(workspaceOwnerHintForResource(undefined)).toBeNull();
  });

  it("reads the owner hint out of a legacy bare-uuid subaccount name", () => {
    expect(workspaceOwnerHintForResource("654ddac0-2325-4e2e-8531-716d5f83e8bd")).toBe(
      "654ddac0",
    );
  });
});

describe("workspaceOwnerPrefix", () => {
  it("takes the first 8 characters of the workspace uuid", () => {
    expect(workspaceOwnerPrefix(KNOWN_WORKSPACE_ID)).toBe("701582c0");
  });
});

describe("the keep list", () => {
  it("holds the business line numbers named in #1320", () => {
    expect(TWILIO_PRUNE_KEEP.workspaceIds).toContain(
      "c916b473-17b1-4c5d-86d5-df8e4326a4b6",
    );
    expect(TWILIO_PRUNE_KEEP.phoneNumbers).toEqual(
      expect.arrayContaining([
        "+16478657844",
        "+19058088017",
        "+12894600186",
        "+14313409877",
      ]),
    );
    expect(TWILIO_PRUNE_KEEP_OWNER_PREFIXES.has("c916b473")).toBe(true);
  });

  it("holds a resource by id, by phone number, by name and by owner workspace", () => {
    const base = {
      resourceType: "incoming_phone_number",
      sid: "PN1",
      liveEnvironments: new Set(),
      knownWorkspacePrefixes: new Set(),
    };

    expect(
      classifyTwilioResource({
        ...base,
        sid: "PN0f56c811eee5ce5987476c01c3319274",
        friendlyName: "Chester Hill Solutions",
        keepSids: TWILIO_PRUNE_KEEP_SIDS,
      }).verdict,
    ).toBe("KEEP");

    expect(
      classifyTwilioResource({
        ...base,
        sid: "PN-other",
        friendlyName: "Some Client",
        phoneNumber: "+1 647 865 7844",
        keepPhoneNumbers: TWILIO_PRUNE_KEEP_PHONE_NUMBERS,
      }).verdict,
    ).toBe("KEEP");

    expect(
      classifyTwilioResource({
        ...base,
        sid: "PN-other2",
        friendlyName: "Chester Hill Solutions",
        keepNames: TWILIO_PRUNE_KEEP_NAMES,
      }).verdict,
    ).toBe("KEEP");

    expect(
      classifyTwilioResource({
        ...base,
        sid: "PN-other3",
        friendlyName: "Chester Hill Solutions · c916b473",
        keepOwnerPrefixes: TWILIO_PRUNE_KEEP_OWNER_PREFIXES,
      }).verdict,
    ).toBe("KEEP");
  });

  it("holds a keep-listed resource even when it looks like a dead preview", () => {
    const entry = classifyTwilioResource({
      resourceType: "twiml_app",
      sid: "AP1",
      friendlyName: "env:callcaster-pr-1047",
      liveEnvironments: new Set(),
      // The keep list stores SIDs lowercased, and the lookup lowercases the
      // SID it is given, so the comparison is on the same footing.
      keepSids: new Set(["ap1"]),
    });
    expect(entry.verdict).toBe("KEEP");
    expect(entry.why).toContain("keep list");
  });
});

describe("a live workspace name", () => {
  it("holds a resource named after a live workspace even with no owner hint", () => {
    const entry = classifyTwilioResource({
      resourceType: "incoming_phone_number",
      sid: "PN1",
      friendlyName: "Chester Hill Solutions",
      knownWorkspaceNames: new Map([["chester hill solutions", { name: "Chester Hill Solutions" }]]),
    });
    expect(entry.verdict).toBe("KEEP");
    expect(entry.why).toContain("live workspace");
  });

  it("does not hold a resource whose name matches nothing", () => {
    const entry = classifyTwilioResource({
      resourceType: "incoming_phone_number",
      sid: "PN1",
      friendlyName: "Tanveer for BEY",
      knownWorkspaceNames: new Map([["chester hill solutions", { name: "Chester Hill Solutions" }]]),
    });
    expect(entry.verdict).toBe("UNKNOWN");
  });
});

describe("an active account", () => {
  it("says so when the owner workspace is active", () => {
    const entry = classifyTwilioResource({
      resourceType: "subaccount",
      sid: "AC1",
      friendlyName: "c916b473-17b1-4c5d-86d5-df8e4326a4b6",
      knownWorkspacePrefixes: new Set(["c916b473"]),
      activeWorkspacePrefixes: new Set(["c916b473"]),
    });
    expect(entry.verdict).toBe("KEEP");
    expect(entry.why).toContain("active account");
  });
});

describe("mergeLiveEnvironmentNames", () => {
  it("keeps the Railway environments", () => {
    const names = mergeLiveEnvironmentNames(new Set(["dev", "qa", "production"]), []);
    expect([...names].sort()).toEqual(["dev", "production", "qa"]);
  });

  it("treats the preview of an open pull request as alive even though Railway cannot see it", () => {
    const names = mergeLiveEnvironmentNames(new Set(["dev", "qa", "production"]), [2675]);
    expect(names.has("callcaster-pr-2675")).toBe(true);
  });

  it("does not invent a preview for a pull request that is not open", () => {
    const names = mergeLiveEnvironmentNames(new Set(["dev"]), []);
    expect(names.has("callcaster-pr-1047")).toBe(false);
  });
});

describe("the environment check", () => {
  it("keeps a protected environment whatever else is true", () => {
    for (const environmentName of ["production", "dev", "qa", "visual-asset-review", "staging"]) {
      const entry = classifyTwilioResource({
        resourceType: "twiml_app",
        sid: "AP1",
        friendlyName: `env:${environmentName}`,
        liveEnvironments: new Set(),
      });
      expect(entry.verdict).toBe("KEEP");
      expect(entry.why).toContain("not disposable");
    }
  });

  it("keeps a preview environment that is still live", () => {
    const entry = classifyTwilioResource({
      resourceType: "twiml_app",
      sid: "AP2",
      friendlyName: `env:${LIVE_PREVIEW}`,
      liveEnvironments: new Set([LIVE_PREVIEW]),
    });
    expect(entry.verdict).toBe("KEEP");
    expect(entry.why).toContain("still live");
  });

  it("keeps a long-lived environment even when the live list does not mention it", () => {
    const entry = classifyTwilioResource({
      resourceType: "twiml_app",
      sid: "AP3",
      friendlyName: "env:some-long-lived-environment",
      liveEnvironments: new Set(),
    });
    expect(entry.verdict).toBe("KEEP");
    expect(entry.why).toContain("not an ephemeral preview");
  });

  it("calls a preview environment stale when Railway no longer reports it", () => {
    const entry = classifyTwilioResource({
      resourceType: "twiml_app",
      sid: "AP4",
      friendlyName: `env:${DEAD_PREVIEW}`,
      liveEnvironments: new Set([LIVE_PREVIEW]),
    });
    expect(entry.verdict).toBe("STALE");
    expect(entry.environmentName).toBe(DEAD_PREVIEW);
  });
});

describe("the owner check", () => {
  it("keeps a resource whose owning workspace is in this database", () => {
    const entry = classifyTwilioResource({
      resourceType: "incoming_phone_number",
      sid: "PN1",
      friendlyName: "Acme Clinic · 701582c0",
      knownWorkspacePrefixes: new Set(["701582c0"]),
    });
    expect(entry.verdict).toBe("KEEP");
    expect(entry.ownerHint).toBe("701582c0");
  });

  it("keeps a legacy-named resource whose owning workspace is in this database", () => {
    const entry = classifyTwilioResource({
      resourceType: "subaccount",
      sid: "AC1",
      friendlyName: "654ddac0-2325-4e2e-8531-716d5f83e8bd",
      knownWorkspacePrefixes: new Set(["654ddac0"]),
    });
    expect(entry.verdict).toBe("KEEP");
    expect(entry.ownerHint).toBe("654ddac0");
  });

  it("never calls a resource stale when its owner is missing from this database", () => {
    const entry = classifyTwilioResource({
      resourceType: "incoming_phone_number",
      sid: "PN2",
      friendlyName: "Production Clinic · deadbeef",
      knownWorkspacePrefixes: new Set(["701582c0"]),
    });
    expect(entry.verdict).toBe("UNKNOWN");
    expect(entry.verdict).not.toBe("STALE");
    expect(entry.why).toContain("account is shared");
  });

  it("keeps a phone number that is still attached to a workspace number", () => {
    const entry = classifyTwilioResource({
      resourceType: "incoming_phone_number",
      sid: "PN3",
      friendlyName: "Production Clinic · deadbeef",
      knownWorkspacePrefixes: new Set(),
      referencedNumberSids: new Set(["PN3"]),
    });
    expect(entry.verdict).toBe("KEEP");
    expect(entry.why).toContain("still attached to a workspace number");
  });

  it("reports a resource with no name as unknown", () => {
    const entry = classifyTwilioResource({
      resourceType: "messaging_service",
      sid: "MG1",
      friendlyName: null,
    });
    expect(entry.verdict).toBe("UNKNOWN");
    expect(entry.why).toContain("no environment or owner hint");
  });
});

describe("buildTwilioPruneReport", () => {
  it("counts the verdicts and leaves workspace resources unknown without a database", () => {
    const report = buildTwilioPruneReport({
      resources: [
        { resourceType: "twiml_app", sid: "AP1", friendlyName: "env:callcaster-pr-1047" },
        { resourceType: "twiml_app", sid: "AP2", friendlyName: "env:dev" },
        { resourceType: "incoming_phone_number", sid: "PN1", friendlyName: "Acme · 701582c0" },
      ],
      liveEnvironments: new Set(),
      knownWorkspaceIds: [],
    });

    expect(report.counts).toEqual({ total: 3, keep: 1, stale: 1, unknown: 1 });
    expect(report.entries.map((entry) => entry.sid)).toEqual(["AP1", "AP2", "PN1"]);
  });

  it("keeps a workspace resource once its owner is in the database", () => {
    const report = buildTwilioPruneReport({
      resources: [
        { resourceType: "incoming_phone_number", sid: "PN1", friendlyName: "Acme · 701582c0" },
      ],
      knownWorkspaceIds: [KNOWN_WORKSPACE_ID],
    });

    expect(report.counts).toEqual({ total: 1, keep: 1, stale: 0, unknown: 0 });
  });
});

describe("the delete guard", () => {
  const staleEntry = {
    resourceType: "twiml_app",
    sid: "AP4",
    friendlyName: `env:${DEAD_PREVIEW}`,
    verdict: "STALE",
    why: "preview environment no longer exists",
    environmentName: DEAD_PREVIEW,
  };

  it("passes a stale preview environment that is gone", () => {
    expect(() =>
      assertPrunable(staleEntry, { liveEnvironments: new Set([LIVE_PREVIEW]) }),
    ).not.toThrow();
  });

  it("refuses a resource that was not classified stale", () => {
    expect(() =>
      assertPrunable(
        { ...staleEntry, verdict: "UNKNOWN", why: "owner could not be verified" },
        { liveEnvironments: new Set() },
      ),
    ).toThrow(/not STALE/);
  });

  it("refuses a preview environment that is still live", () => {
    expect(() =>
      assertPrunable(staleEntry, { liveEnvironments: new Set([DEAD_PREVIEW]) }),
    ).toThrow(/still live/);
  });

  it("refuses a protected environment", () => {
    expect(() =>
      assertEnvironmentPrunable({ environmentName: "production", liveEnvironments: new Set() }),
    ).toThrow(/protected/);
  });

  it("refuses a resource that names no environment", () => {
    expect(() =>
      assertEnvironmentPrunable({ environmentName: null, liveEnvironments: new Set() }),
    ).toThrow(/names no environment/);
  });
});
