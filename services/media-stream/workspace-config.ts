import { eq } from "drizzle-orm";
import { workspace } from "@/db/schema";
import {
  CoachingConfig,
  DEFAULT_COACHING_CONFIG,
  type CoachingConfig as CoachingConfigType,
  type WorkspaceFeatureFlags,
} from "@/lib/coaching-schemas";
import {
  liveMediaCapabilities,
  type LiveMediaCapabilities,
} from "@/lib/live-media-capabilities";
import { adminDb } from "@/server/admin-db";

export type WorkspaceMediaStreamConfig = {
  featureFlags: WorkspaceFeatureFlags | Record<string, unknown>;
  coachingConfig: CoachingConfigType;
  /** Derived capabilities — consumers gate on these, never on the raw flags. */
  capabilities: LiveMediaCapabilities;
};

export async function loadWorkspaceMediaStreamConfig(
  workspaceId: string,
): Promise<WorkspaceMediaStreamConfig> {
  const row = await adminDb.query.workspace.findFirst({
    where: eq(workspace.id, workspaceId),
    columns: { feature_flags: true, coaching_config: true },
  });

  const featureFlags = (row?.feature_flags ?? {}) as WorkspaceFeatureFlags;
  const coachingParsed = CoachingConfig.safeParse(row?.coaching_config ?? {});
  const coachingConfig = coachingParsed.success
    ? coachingParsed.data
    : DEFAULT_COACHING_CONFIG;

  return {
    featureFlags,
    coachingConfig,
    capabilities: liveMediaCapabilities(featureFlags),
  };
}
