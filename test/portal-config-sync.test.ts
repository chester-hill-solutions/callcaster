import { describe, expect, test } from "vitest";
import { DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG } from "@/lib/database/workspace-twilio-config.server";

const SHARED_PORTAL_CONFIG_FIELDS = [
  "trafficClass",
  "throughputProduct",
  "multiTenancyMode",
  "trafficShapingEnabled",
  "defaultMessageIntent",
  "sendMode",
  "messagingServiceSid",
  "onboardingStatus",
  "smsSenderClass",
  "smsTargetMps",
  "voiceTargetCps",
  "voiceConcurrentCallLimit",
  "parallelDispatchEnabled",
  "supportNotes",
  "updatedAt",
  "updatedBy",
  "auditTrail",
] as const;

describe("edge portal-config field sync", () => {
  test("app and edge portal config defaults share the same normalized fields", async () => {
    const edgePortalConfig = await import(
      // eslint-disable-next-line import/no-unresolved -- Deno edge module; not in app tsconfig paths
      "../../supabase/functions/_shared/portal-config.ts"
    );

    const normalized = edgePortalConfig.normalizePortalOpsConfig(null);
    for (const field of SHARED_PORTAL_CONFIG_FIELDS) {
      expect(normalized).toHaveProperty(field);
      expect(DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG).toHaveProperty(field);
      expect(normalized[field as keyof typeof normalized]).toEqual(
        DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG[field as keyof typeof DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG],
      );
    }

    expect(normalized.smsSenderClass).toBe(DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.smsSenderClass);
    expect(normalized.smsTargetMps).toBe(DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.smsTargetMps);
    expect(normalized.voiceTargetCps).toBe(DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.voiceTargetCps);
    expect(normalized.voiceConcurrentCallLimit).toBe(
      DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.voiceConcurrentCallLimit,
    );
    expect(normalized.parallelDispatchEnabled).toBe(
      DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.parallelDispatchEnabled,
    );
  });
});
