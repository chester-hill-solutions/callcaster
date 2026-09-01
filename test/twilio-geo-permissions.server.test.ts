import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";

const mocks = vi.hoisted(() => ({
  bulkCountryUpdatesCreate: vi.fn(async () => ({})),
  availableLocalList: vi.fn(async () => [] as unknown[]),
  sendComplianceOpsAlert: vi.fn(async () => ({ sent: true })),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/twilio-client.server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/twilio-client.server")>();
  return {
    ...original,
    createWorkspaceTwilioClient: vi.fn(async () => ({
      voice: {
        v1: {
          dialingPermissions: {
            bulkCountryUpdates: {
              create: (...args: unknown[]) =>
                mocks.bulkCountryUpdatesCreate(...args),
            },
          },
        },
      },
      availablePhoneNumbers: (country: string) => ({
        local: { list: () => mocks.availableLocalList(country) },
      }),
    })),
  };
});

vi.mock("@/lib/twilio-compliance-notify.server", () => ({
  sendComplianceOpsAlert: (...args: unknown[]) =>
    mocks.sendComplianceOpsAlert(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

import {
  alertGeoReadinessBlocked,
  alertSmsGeoPermissionBlocked,
  buildVoiceGeoUpdateRequest,
  ensureVoiceGeoPermissions,
  preflightCountriesFor,
  preflightNumberPurchase,
} from "@/lib/twilio-geo-permissions.server";

describe("twilio-geo-permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitsForTests();
    mocks.bulkCountryUpdatesCreate.mockResolvedValue({});
    mocks.availableLocalList.mockResolvedValue([]);
  });

  test("preflightCountriesFor maps operating country to search list", () => {
    expect(preflightCountriesFor("CA")).toEqual(["CA"]);
    expect(preflightCountriesFor("US")).toEqual(["US"]);
    expect(preflightCountriesFor("BOTH")).toEqual(["CA", "US"]);
    expect(preflightCountriesFor(null)).toEqual(["CA", "US"]);
  });

  // Twilio's API reference shape for one UpdateRequest element: iso_code plus
  // all three *_enabled flags, flags encoded as the strings "true"/"false".
  // A partial object (only iso_code + low_risk_numbers_enabled) is rejected
  // with 20001 "unable to parse the updateRequest" (#1474).
  const EXPECTED_UPDATE_REQUEST =
    '[{"iso_code":"CA","low_risk_numbers_enabled":"true",' +
    '"high_risk_special_numbers_enabled":"false",' +
    '"high_risk_tollfraud_numbers_enabled":"false"},' +
    '{"iso_code":"US","low_risk_numbers_enabled":"true",' +
    '"high_risk_special_numbers_enabled":"false",' +
    '"high_risk_tollfraud_numbers_enabled":"false"}]';

  test("buildVoiceGeoUpdateRequest matches Twilio's documented UpdateRequest shape byte-for-byte", () => {
    expect(buildVoiceGeoUpdateRequest()).toBe(EXPECTED_UPDATE_REQUEST);
    expect(buildVoiceGeoUpdateRequest(["GB"])).toBe(
      '[{"iso_code":"GB","low_risk_numbers_enabled":"true",' +
        '"high_risk_special_numbers_enabled":"false",' +
        '"high_risk_tollfraud_numbers_enabled":"false"}]',
    );
  });

  test("ensureVoiceGeoPermissions sends exactly the documented UpdateRequest body for CA and US", async () => {
    const result = await ensureVoiceGeoPermissions({ workspaceId: "ws-1" });

    expect(result).toEqual({ ok: true });
    expect(mocks.bulkCountryUpdatesCreate).toHaveBeenCalledTimes(1);
    // The SDK passes `updateRequest` through untouched as the `UpdateRequest`
    // form field, so this string is the wire body Twilio parses.
    expect(mocks.bulkCountryUpdatesCreate).toHaveBeenCalledWith({
      updateRequest: EXPECTED_UPDATE_REQUEST,
    });
  });

  test("ensureVoiceGeoPermissions never throws — returns the error detail", async () => {
    mocks.bulkCountryUpdatesCreate.mockRejectedValue(
      Object.assign(new Error("not authorized"), { status: 401, code: 20003 }),
    );

    const result = await ensureVoiceGeoPermissions({ workspaceId: "ws-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not authorized");
  });

  test("preflightNumberPurchase passes on an empty (inventory-only) result", async () => {
    const results = await preflightNumberPurchase({
      workspaceId: "ws-1",
      operatingCountry: "CA",
    });

    expect(results).toEqual([{ country: "CA", ok: true }]);
    expect(mocks.availableLocalList).toHaveBeenCalledWith("CA");
  });

  test("preflightNumberPurchase maps a failure to an actionable issue", async () => {
    mocks.availableLocalList.mockRejectedValue(
      Object.assign(new Error("Access forbidden for this country"), {
        status: 403,
        code: 90010,
      }),
    );

    const results = await preflightNumberPurchase({
      workspaceId: "ws-1",
      operatingCountry: "CA",
    });

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].issue).toContain("Number search in CA failed");
    expect(results[0].issue).toContain("Twilio Console");
  });

  test("alertSmsGeoPermissionBlocked sends once per workspace per window", async () => {
    await alertSmsGeoPermissionBlocked({
      workspaceId: "ws-1",
      messageSid: "SM1",
      to: "+16045550100",
    });
    await alertSmsGeoPermissionBlocked({
      workspaceId: "ws-1",
      messageSid: "SM2",
      to: "+16045550101",
    });

    expect(mocks.sendComplianceOpsAlert).toHaveBeenCalledTimes(1);
    expect(mocks.sendComplianceOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        reason: "geo_blocked",
        path: "messaging_geo",
        errorDetail: expect.stringContaining("21408"),
      }),
    );
  });

  test("alertGeoReadinessBlocked no-ops on empty issues and rate-limits repeats", async () => {
    await alertGeoReadinessBlocked({ workspaceId: "ws-2", issues: [] });
    expect(mocks.sendComplianceOpsAlert).not.toHaveBeenCalled();

    await alertGeoReadinessBlocked({ workspaceId: "ws-2", issues: ["a"] });
    await alertGeoReadinessBlocked({ workspaceId: "ws-2", issues: ["b"] });
    expect(mocks.sendComplianceOpsAlert).toHaveBeenCalledTimes(1);
  });
});
