import { WorkspaceFeatureFlags } from "@/lib/coaching-schemas";
import { logger } from "@/lib/logger.server";

export function warnInvalidWorkspaceFeatureFlags(workspaceId: string, flags: unknown): void {
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) return;

  const keys = Object.keys(WorkspaceFeatureFlags.shape).filter((key) => {
    if (!Object.hasOwn(flags, key)) return false;
    const value = Reflect.get(flags, key);
    return value !== undefined && typeof value !== "boolean";
  });
  if (keys.length) {
    logger.warn("workspace.feature_flags.invalid", { workspaceId, keys });
  }
}
