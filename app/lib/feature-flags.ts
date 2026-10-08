import type { WorkspaceFeatureFlags } from "@/lib/coaching-schemas";

/**
 * Reads a workspace feature flag from `workspace.feature_flags` JSON.
 * Returns false for missing/invalid flags.
 */
export function hasFeatureFlag(
  flags: WorkspaceFeatureFlags | Record<string, unknown> | null | undefined,
  flag: keyof WorkspaceFeatureFlags,
): boolean {
  return flags?.[flag] === true;
}
