/**
 * Object-key namespace for inbound caller voicemails.
 *
 * Voicemails must never share the workspace-audio library prefix
 * (`<workspace>/<file>`): a caller's message mixed into the library list can
 * be picked as an IVR prompt, and the library picker still has to guess what
 * "voicemail-" means. Caller audio lives under `voicemail/<workspace>/` so a
 * library list (prefix `` `<workspace>` ``) and a voicemails list (prefix
 * `` `voicemail/<workspace>` ``) are disjoint by construction.
 */

export const VOICEMAIL_OBJECT_PREFIX = "voicemail";

/** Full bucket object path for one inbound voicemail: `voicemail/<ws>/<file>`. */
export function voicemailObjectPath(workspaceId: string, fileName: string): string {
  return `${VOICEMAIL_OBJECT_PREFIX}/${workspaceId}/${fileName}`;
}

/** List prefix that returns only this workspace's voicemails. */
export function voicemailListPrefix(workspaceId: string): string {
  return `${VOICEMAIL_OBJECT_PREFIX}/${workspaceId}`;
}

/** True for the legacy `voicemail-*` basenames written before the namespace split. */
export function isLegacyVoicemailObjectName(fileName: string): boolean {
  return fileName.startsWith("voicemail-");
}