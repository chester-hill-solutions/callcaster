/**
 * Geographic-permission automation for workspace subaccounts
 * (docs/twilio-parent-ops-runbook.md §1, turned into code where Twilio's API
 * allows):
 *
 * - VOICE geo-permissions have a public API (Voice DialingPermissions) —
 *   `ensureVoiceGeoPermissions` enables CA/US on the subaccount.
 * - NUMBER PURCHASING has no toggle API, but an AvailablePhoneNumbers search
 *   surfaces permission/regulatory failures — `preflightNumberPurchase` maps
 *   them to actionable issues before a workspace goes live.
 * - SMS geo-permissions are Console-only (no public read or write API). The
 *   fallback is detection: Twilio error 21408 on a send triggers
 *   `alertSmsGeoPermissionBlocked`, a rate-limited ops email naming the
 *   exact Console toggle.
 */

import { logger } from "@/lib/logger.server";
import {
  createWorkspaceTwilioClient,
  withTwilioRetry,
} from "@/lib/twilio-client.server";
import { presentTwilioError } from "@/lib/twilio-errors";
import { sendComplianceOpsAlert } from "@/lib/twilio-compliance-notify.server";
import { checkRateLimit } from "@/lib/platform-rate-limit.server";
import type { WorkspaceOperatingCountry } from "@/lib/types";

/** Countries CallCaster provisions for today (Canada-first, US second). */
export const VOICE_GEO_COUNTRIES = ["CA", "US"] as const;

/**
 * One element of the `UpdateRequest` array Twilio's Voice
 * `DialingPermissions/BulkCountryUpdates` endpoint accepts. Mirrors Twilio's
 * API reference verbatim: `iso_code` plus all three `*_enabled` flags, with
 * the flags encoded as the strings "true"/"false" (the form Twilio documents
 * for the parameter). Twilio rejects a partial object — sending only
 * `iso_code` + `low_risk_numbers_enabled` fails with 20001 "unable to parse
 * the updateRequest" (#1474).
 */
export type VoiceGeoCountryUpdate = {
  iso_code: string;
  low_risk_numbers_enabled: "true" | "false";
  high_risk_special_numbers_enabled: "true" | "false";
  high_risk_tollfraud_numbers_enabled: "true" | "false";
};

/**
 * Build the JSON string sent as the `UpdateRequest` form field: low-risk
 * dialing on, both high-risk classes (premium/special numbers, toll-fraud
 * destinations) explicitly off for every country.
 */
export function buildVoiceGeoUpdateRequest(
  countries: readonly string[] = VOICE_GEO_COUNTRIES,
): string {
  const updates: VoiceGeoCountryUpdate[] = countries.map((isoCode) => ({
    iso_code: isoCode,
    low_risk_numbers_enabled: "true",
    high_risk_special_numbers_enabled: "false",
    high_risk_tollfraud_numbers_enabled: "false",
  }));
  return JSON.stringify(updates);
}

/** One ops alert per workspace per window — a campaign of failing sends must not fan out into hundreds of emails. */
const GEO_ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;

export type GeoPermissionResult = { ok: true } | { ok: false; error: string };

export type NumberPurchasePreflight = {
  country: string;
  ok: boolean;
  /** Actionable description when the search failed (permissions/regulatory). */
  issue?: string;
};

export function preflightCountriesFor(
  operatingCountry: WorkspaceOperatingCountry | null | undefined,
): string[] {
  if (operatingCountry === "CA") return ["CA"];
  if (operatingCountry === "US") return ["US"];
  return ["CA", "US"];
}

/**
 * Enable low-risk voice dialing permissions for CA/US on the workspace's
 * subaccount. Idempotent; never throws — callers surface the failure as a
 * provisioning warning / blocking issue instead of aborting provisioning.
 */
export async function ensureVoiceGeoPermissions(args: {
  workspaceId: string;
}): Promise<GeoPermissionResult> {
  try {
    const client = await createWorkspaceTwilioClient({
      workspaceId: args.workspaceId,
    });
    await withTwilioRetry(
      () =>
        client.voice.v1.dialingPermissions.bulkCountryUpdates.create({
          updateRequest: buildVoiceGeoUpdateRequest(),
        }),
      { workspaceId: args.workspaceId, operation: "voice_geo_permissions_enable" },
    );
    logger.info("twilio.geo.voice_permissions_enabled", {
      workspaceId: args.workspaceId,
      countries: VOICE_GEO_COUNTRIES,
    });
    return { ok: true };
  } catch (error) {
    const presented = presentTwilioError(error);
    logger.error("twilio.geo.voice_permissions_failed", {
      workspaceId: args.workspaceId,
      twilioCode: presented.twilioCode,
      error: presented.adminDetail,
    });
    return { ok: false, error: presented.adminDetail };
  }
}

/**
 * Verify the subaccount can actually search numbers in each operating
 * country. A successful (even empty) search means permissions are fine —
 * an empty result is an inventory condition, not a permission failure.
 */
export async function preflightNumberPurchase(args: {
  workspaceId: string;
  operatingCountry?: WorkspaceOperatingCountry | null;
}): Promise<NumberPurchasePreflight[]> {
  const countries = preflightCountriesFor(args.operatingCountry);
  const results: NumberPurchasePreflight[] = [];

  let client;
  try {
    client = await createWorkspaceTwilioClient({ workspaceId: args.workspaceId });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return countries.map((country) => ({
      country,
      ok: false,
      issue: `Could not create the workspace Twilio client for the ${country} number preflight: ${detail}`,
    }));
  }

  for (const country of countries) {
    try {
      await withTwilioRetry(
        () => client.availablePhoneNumbers(country).local.list({ limit: 1 }),
        {
          workspaceId: args.workspaceId,
          operation: `number_purchase_preflight_${country.toLowerCase()}`,
        },
      );
      results.push({ country, ok: true });
    } catch (error) {
      const presented = presentTwilioError(error);
      results.push({
        country,
        ok: false,
        issue:
          `Number search in ${country} failed for the workspace subaccount ` +
          `(Twilio ${presented.twilioCode ?? "error"}: ${presented.adminDetail}). ` +
          `Check the subaccount's number-purchase/geographic permissions in the ` +
          `Twilio Console and any ${country} regulatory address requirements.`,
      });
    }
  }
  return results;
}

/**
 * Rate-limited ops alert for geo-readiness failures found by the compliance
 * job (voice enable failure or number-purchase preflight failure).
 */
export async function alertGeoReadinessBlocked(args: {
  workspaceId: string;
  issues: string[];
}): Promise<void> {
  if (args.issues.length === 0) return;
  const gate = await checkRateLimit({
    key: `ops:geo-alert:${args.workspaceId}`,
    limit: 1,
    windowMs: GEO_ALERT_WINDOW_MS,
  });
  if (!gate.ok) return;
  await sendComplianceOpsAlert({
    workspaceId: args.workspaceId,
    reason: "geo_blocked",
    path: "geo_permissions",
    blockingIssues: args.issues,
  });
}

/**
 * Detection path for the one toggle Twilio exposes no API for: SMS
 * geographic permissions. Twilio error 21408 ("Permission to send an SMS has
 * not been enabled for the region") is unambiguous, so turn the first
 * occurrence per workspace/window into an ops email naming the Console
 * toggle instead of letting sends fail silently one by one.
 */
export async function alertSmsGeoPermissionBlocked(args: {
  workspaceId: string;
  messageSid: string;
  to?: string | null;
}): Promise<void> {
  const gate = await checkRateLimit({
    key: `ops:sms-geo-alert:${args.workspaceId}`,
    limit: 1,
    windowMs: GEO_ALERT_WINDOW_MS,
  });
  if (!gate.ok) return;
  await sendComplianceOpsAlert({
    workspaceId: args.workspaceId,
    reason: "geo_blocked",
    path: "messaging_geo",
    errorDetail:
      `SMS ${args.messageSid}${args.to ? ` to ${args.to}` : ""} failed with ` +
      `Twilio 21408: the destination region is not enabled for messaging on ` +
      `this workspace's subaccount. Fix: Twilio Console → switch into the ` +
      `subaccount → Messaging → Settings → Geo permissions → enable the ` +
      `destination country. (No public API exists for this toggle.)`,
  });
}
