import type { WorkspaceFeatureFlags } from "@/lib/coaching-schemas";
import { WorkspaceFeatureFlags as WorkspaceFeatureFlagsSchema } from "@/lib/coaching-schemas";

/**
 * Reads a workspace feature flag from `workspace.feature_flags` JSON.
 * Returns false for missing/invalid flags.
 */
export function hasFeatureFlag(
  flags: WorkspaceFeatureFlags | Record<string, unknown> | null | undefined,
  flag: keyof WorkspaceFeatureFlags,
): boolean {
  const parsed = WorkspaceFeatureFlagsSchema.safeParse(flags ?? {});
  if (!parsed.success) return false;
  return Boolean(parsed.data[flag]);
}

/** True when live transcription or live coaching is enabled for the workspace. */
export function coachingEnabled(
  flags?: WorkspaceFeatureFlags | Record<string, unknown> | null,
): boolean {
  return (
    hasFeatureFlag(flags, "liveTranscription") ||
    hasFeatureFlag(flags, "liveCoaching")
  );
}
