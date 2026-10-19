/* eslint-env node */
/**
 * Pure policy for the Twilio resource prune report.
 *
 * Two checks decide whether a Twilio resource may ever be deleted, and this
 * file holds both of them so the report and any future delete path read the
 * same rules.
 *
 * ## The environment check
 *
 * A resource is only a candidate when it belongs to an ephemeral preview
 * environment (`callcaster-pr-<number>`) that Railway no longer reports. Those
 * are the environments a closed pull request leaves behind. Long-lived
 * environments (production, dev, qa, visual-asset-review, staging) are never
 * candidates, whatever else is true about them.
 *
 * Environment resources are named `env:<railway-environment-name>` by
 * app/server/environment-twiml-app.server.ts.
 *
 * ## The owner check
 *
 * Every other resource belongs to a workspace and is named
 * `<Workspace Name> · <first 8 characters of the workspace uuid>` by
 * app/lib/twilio-resource-name.ts.
 *
 * The Twilio account is shared by every environment. Dev, review and
 * production all point at the same account, so "this workspace is missing
 * from the database I am connected to" is NOT evidence that the resource is
 * stale. A workspace that lives in production is missing from the dev
 * database while its resources are very much alive.
 *
 * Those resources are therefore UNKNOWN, never STALE. The report says which
 * owner it could not verify and stops there. Turning UNKNOWN into a deletion
 * is a human decision made against the environment that owns the resource.
 *
 * ## Verdicts
 *
 * KEEP    - the resource is attached to something that still exists.
 * STALE   - the only shape a deletion candidate may take: an ephemeral
 *            preview environment that no longer exists.
 * UNKNOWN - the owner could not be verified. Never means prunable.
 *
 * No I/O in this file. The report script reads; this file decides.
 */

export const ENVIRONMENT_APP_PREFIX = "env:";

/** Railway names pull-request environments `callcaster-pr-<number>`. */
export const EPHEMERAL_ENVIRONMENT_PATTERN = /^callcaster-pr-\d+$/;

/**
 * Environments whose resources are never disposable. Listed explicitly so the
 * refusal is visible in the report rather than implied by a pattern.
 */
export const PROTECTED_ENVIRONMENT_NAMES = new Set([
  "production",
  "dev",
  "qa",
  "visual-asset-review",
  "staging",
]);

/** The workspace owner hint at the end of a workspace resource name. */
export const WORKSPACE_OWNER_HINT_PATTERN = / · ([0-9a-f]{8})$/i;

/**
 * Subaccounts created before the naming convention was agreed are named with
 * the bare workspace uuid. The first survey of the account found 183 of 192
 * subaccounts named this way, so a name with no hint is often still an owner.
 */
export const LEGACY_UUID_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An environment name as Railway writes it: letters, digits and dashes. */
const ENVIRONMENT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

export const PRUNE_VERDICT = {
  KEEP: "KEEP",
  STALE: "STALE",
  UNKNOWN: "UNKNOWN",
};

/**
 * A resource that is on the keep list is never prunable, whatever else is true
 * about it. The keep list is checked first, so a keep-listed resource that
 * also looks like a dead preview is still held.
 */
export function keepListVerdict({
  sid,
  friendlyName,
  phoneNumber,
  keepSids = new Set(),
  keepNames = new Set(),
  keepPhoneNumbers = new Set(),
  keepOwnerPrefixes = new Set(),
} = {}) {
  if (sid && keepSids.has(String(sid).toLowerCase())) {
    return "on the keep list by resource id";
  }
  if (phoneNumber && keepPhoneNumbers.has(String(phoneNumber).replace(/[^\d+]/g, ""))) {
    return "on the keep list by phone number";
  }
  if (friendlyName && keepNames.has(String(friendlyName).trim().toLowerCase())) {
    return "on the keep list by name";
  }
  const ownerHint = workspaceOwnerHintForResource(friendlyName);
  if (ownerHint && keepOwnerPrefixes.has(ownerHint)) {
    return "on the keep list by owner workspace";
  }
  return null;
}

/** Resource types the report knows about, and whether the API can remove one. */
export const REMOVABLE_VIA_API = {
  twiml_app: true,
  messaging_service: true,
  incoming_phone_number: true,
  // Twilio has no delete for a subaccount. Removing one is a console action.
  subaccount: false,
};

/**
 * The environment a resource belongs to, from its name.
 * Returns null when the name is not an environment resource name.
 */
export function environmentNameForResource(friendlyName) {
  const name = typeof friendlyName === "string" ? friendlyName : "";
  if (!name.startsWith(ENVIRONMENT_APP_PREFIX)) return null;
  const environmentName = name.slice(ENVIRONMENT_APP_PREFIX.length);
  if (!ENVIRONMENT_NAME_PATTERN.test(environmentName)) return null;
  return environmentName;
}

/**
 * The workspace owner hint of a resource, from its name.
 * Returns null when the name carries no owner hint.
 */
export function workspaceOwnerHintForResource(friendlyName) {
  const name = typeof friendlyName === "string" ? friendlyName : "";
  const match = WORKSPACE_OWNER_HINT_PATTERN.exec(name);
  if (match) return match[1].toLowerCase();
  if (LEGACY_UUID_NAME_PATTERN.test(name)) return name.slice(0, 8).toLowerCase();
  return null;
}

/** The first 8 characters of a workspace uuid, the hint its resources carry. */
export function workspaceOwnerPrefix(workspaceId) {
  return typeof workspaceId === "string" ? workspaceId.slice(0, 8).toLowerCase() : null;
}

export function isEphemeralEnvironment(environmentName) {
  return EPHEMERAL_ENVIRONMENT_PATTERN.test(String(environmentName ?? ""));
}

export function isProtectedEnvironment(environmentName) {
  return PROTECTED_ENVIRONMENT_NAMES.has(String(environmentName ?? ""));
}

/**
 * Decide one resource.
 *
 * `liveEnvironments` is the set of environment names Railway still reports.
 * `knownWorkspacePrefixes` is the set of owner hints of the workspaces in the
 * database the report is connected to.
 * `referencedNumberSids` is the set of phone-number SIDs still attached to a
 * workspace number row.
 */
export function classifyTwilioResource({
  resourceType,
  sid,
  friendlyName,
  phoneNumber,
  liveEnvironments = new Set(),
  knownWorkspacePrefixes = new Set(),
  activeWorkspacePrefixes = new Set(),
  knownWorkspaceNames = new Map(),
  referencedNumberSids = new Set(),
  keepSids = new Set(),
  keepNames = new Set(),
  keepPhoneNumbers = new Set(),
  keepOwnerPrefixes = new Set(),
} = {}) {
  const entry = {
    resourceType,
    sid: sid ?? null,
    friendlyName: friendlyName ?? null,
    phoneNumber: phoneNumber ?? null,
    verdict: PRUNE_VERDICT.UNKNOWN,
    why: "",
    environmentName: null,
    ownerHint: null,
    removableViaApi: REMOVABLE_VIA_API[resourceType] === true,
  };

  const keepReason = keepListVerdict({
    sid,
    friendlyName,
    phoneNumber,
    keepSids,
    keepNames,
    keepPhoneNumbers,
    keepOwnerPrefixes,
  });
  if (keepReason) {
    return { ...entry, verdict: PRUNE_VERDICT.KEEP, why: keepReason };
  }

  if (resourceType === "incoming_phone_number" && referencedNumberSids.has(sid)) {
    return { ...entry, verdict: PRUNE_VERDICT.KEEP, why: "still attached to a workspace number" };
  }

  const environmentName = environmentNameForResource(friendlyName);
  if (environmentName !== null) {
    entry.environmentName = environmentName;
    if (isProtectedEnvironment(environmentName)) {
      return { ...entry, verdict: PRUNE_VERDICT.KEEP, why: `environment "${environmentName}" is not disposable` };
    }
    if (!isEphemeralEnvironment(environmentName)) {
      return { ...entry, verdict: PRUNE_VERDICT.KEEP, why: `environment "${environmentName}" is not an ephemeral preview` };
    }
    if (liveEnvironments.has(environmentName)) {
      return { ...entry, verdict: PRUNE_VERDICT.KEEP, why: `environment "${environmentName}" is still live` };
    }
    return { ...entry, verdict: PRUNE_VERDICT.STALE, why: `preview environment "${environmentName}" no longer exists` };
  }

  const ownerHint = workspaceOwnerHintForResource(friendlyName);
  if (ownerHint !== null) {
    entry.ownerHint = ownerHint;
    if (knownWorkspacePrefixes.has(ownerHint)) {
      return {
        ...entry,
        verdict: PRUNE_VERDICT.KEEP,
        why: activeWorkspacePrefixes.has(ownerHint)
          ? `owner workspace ${ownerHint} is an active account`
          : `owner workspace ${ownerHint} exists in this database`,
      };
    }
    return {
      ...entry,
      verdict: PRUNE_VERDICT.UNKNOWN,
      why:
        `owner workspace ${ownerHint} is not in this database; the Twilio account is shared, ` +
        "so check the environment that owns it before deleting",
    };
  }

  // A resource named after a live workspace has a live owner, even when the
  // name carries no owner hint. Names change, so this is a weaker signal than
  // the owner hint, and it only ever holds a resource.
  const nameKey = typeof friendlyName === "string" ? friendlyName.trim().toLowerCase() : "";
  if (nameKey && knownWorkspaceNames.has(nameKey)) {
    const owner = knownWorkspaceNames.get(nameKey);
    return {
      ...entry,
      verdict: PRUNE_VERDICT.KEEP,
      why: `name matches the live workspace "${owner.name}"`,
    };
  }

  return { ...entry, why: "resource name carries no environment or owner hint" };
}

/**
 * Classify a list of resources and count the verdicts.
 *
 * `knownWorkspaceIds` holds the workspace ids of the database the report is
 * connected to. It may be empty, which leaves every workspace-owned resource
 * UNKNOWN rather than guessing.
 */
export function buildTwilioPruneReport({
  resources = [],
  liveEnvironments = new Set(),
  knownWorkspaceIds = [],
  knownWorkspaceNames = new Map(),
  activeWorkspacePrefixes = new Set(),
  referencedNumberSids = new Set(),
  keepSids = new Set(),
  keepNames = new Set(),
  keepPhoneNumbers = new Set(),
  keepOwnerPrefixes = new Set(),
} = {}) {
  const knownWorkspacePrefixes = new Set(
    [...knownWorkspaceIds].map(workspaceOwnerPrefix).filter((prefix) => prefix !== null),
  );

  const entries = resources.map((resource) =>
    classifyTwilioResource({
      ...resource,
      liveEnvironments,
      knownWorkspacePrefixes,
      knownWorkspaceNames,
      activeWorkspacePrefixes,
      referencedNumberSids,
      keepSids,
      keepNames,
      keepPhoneNumbers,
      keepOwnerPrefixes,
    }),
  );

  const counts = { total: entries.length, keep: 0, stale: 0, unknown: 0 };
  for (const entry of entries) {
    if (entry.verdict === PRUNE_VERDICT.KEEP) counts.keep += 1;
    else if (entry.verdict === PRUNE_VERDICT.STALE) counts.stale += 1;
    else counts.unknown += 1;
  }

  return { counts, entries };
}

/**
 * The environment check, on its own, for a delete path that already decided
 * something is a candidate.
 */
export function assertEnvironmentPrunable({ environmentName, liveEnvironments = new Set() } = {}) {
  if (environmentName === null || environmentName === undefined) {
    throw new Error("prune guard: the resource names no environment, so its environment check never passed");
  }
  if (isProtectedEnvironment(environmentName)) {
    throw new Error(`prune guard: environment "${environmentName}" is protected and is never pruned`);
  }
  if (!isEphemeralEnvironment(environmentName)) {
    throw new Error(`prune guard: environment "${environmentName}" is not an ephemeral preview`);
  }
  if (liveEnvironments.has(environmentName)) {
    throw new Error(`prune guard: environment "${environmentName}" is still live`);
  }
}

/**
 * The full check a delete path has to pass: the resource must have been
 * classified STALE, and its environment must still be an ephemeral preview
 * that no longer exists.
 */
export function assertPrunable(entry, { liveEnvironments = new Set() } = {}) {
  if (!entry || typeof entry !== "object") {
    throw new Error("prune guard: no resource entry to check");
  }
  if (entry.verdict !== PRUNE_VERDICT.STALE) {
    throw new Error(
      `prune guard: ${entry.sid ?? entry.resourceType ?? "resource"} is ${entry.verdict}, not STALE. ${entry.why ?? ""}`.trim(),
    );
  }
  assertEnvironmentPrunable({ environmentName: entry.environmentName, liveEnvironments });
}
