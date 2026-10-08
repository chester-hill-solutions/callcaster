/**
 * Naming for the Twilio resources a workspace owns.
 *
 * Every Twilio subaccount used to be created with the raw workspace UUID as its
 * friendly name, so the Twilio console read as a wall of
 * `6aff2ab3-8a7a-48b2-92e6-f86ec7441ca0` with no way to tell whose was whose
 * and no way back to the workspace row. Phone numbers already carried the
 * workspace name (`Civic Action / +15551234567`); the subaccount and the API
 * key did not.
 *
 * The format is `Workspace Name · <first 8 of the uuid>`:
 * - the name leads, because the console is read by humans;
 * - the id suffix keeps the name unique (two workspaces may share a name) and
 *   gives an operator a direct handle back to the workspace row, which the
 *   number/workspace cull needs;
 * - it matches the existing number convention, so one workspace's resources
 *   read as one block in the console.
 *
 * Twilio truncates friendly names rather than rejecting them, and the truncation
 * is silent, so the suffix is what keeps the resource identifiable when the name
 * is long. `MAX_TWILIO_FRIENDLY_NAME_LENGTH` is set below Twilio's limit so the
 * id suffix always survives.
 */

/**
 * Twilio accepts friendly names up to 160 characters. Reserve room for the
 * ` · <id>` suffix so the identifying part is never the part that gets cut.
 */
export const MAX_TWILIO_FRIENDLY_NAME_LENGTH = 160;

/** Separator between the name and the id prefix. */
const SUFFIX_SEPARATOR = " · ";

/** How much of the workspace uuid to keep — enough to be unique in practice. */
const WORKSPACE_ID_PREFIX_LENGTH = 8;

/** Control characters are rejected by Twilio and break console rendering. */
function sanitize(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The ` · 6aff2ab3` part of a resource name. Empty-safe. */
function workspaceSuffix(workspaceId: string): string {
  const id = sanitize(workspaceId);
  if (!id) return "";
  return `${SUFFIX_SEPARATOR}${id.slice(0, WORKSPACE_ID_PREFIX_LENGTH)}`;
}

/**
 * Derived from the separator and the id prefix rather than hardcoded, so
 * changing either cannot silently shrink the reserved budget and let the
 * suffix be the part Twilio truncates.
 */
const SUFFIX_RESERVE = SUFFIX_SEPARATOR.length + WORKSPACE_ID_PREFIX_LENGTH;

/**
 * Friendly name for a workspace's Twilio subaccount and API key.
 *
 * Falls back to the uuid alone when the workspace has no usable name, so a
 * blank or whitespace-only name never produces a resource named ` · 6aff2ab3`.
 */
export function workspaceResourceName(
  workspaceName: string | null | undefined,
  workspaceId: string,
): string {
  const suffix = workspaceSuffix(workspaceId);
  const name = sanitize(workspaceName ?? "");

  if (!name) {
    return sanitize(workspaceId) || "Workspace";
  }

  const budget = MAX_TWILIO_FRIENDLY_NAME_LENGTH - SUFFIX_RESERVE;
  const trimmed = name.length > budget ? name.slice(0, budget).trimEnd() : name;

  // Guard the degenerate case where the name is all separator characters and
  // trims away to nothing at the budget boundary.
  return trimmed ? `${trimmed}${suffix}` : sanitize(workspaceId) || "Workspace";
}
