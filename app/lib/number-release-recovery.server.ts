import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import {
  claimNumberReleaseRecovery,
  getNumberRelease,
} from "@/server/number-release-intent.server";
import {
  resumeNumberRelease,
  retainNumberReleaseForRecovery,
} from "@/lib/number-release.server";
import { logger } from "@/lib/logger.server";

export async function runNumberReleaseRecovery() {
  const releases = await claimNumberReleaseRecovery();
  let completed = 0;
  for (const release of releases) {
    try {
      const twilio =
        release.state === "released"
          ? null
          : await createWorkspaceTwilioInstance({
              workspace_id: release.workspace,
            });
      await resumeNumberRelease(release, twilio);
      completed++;
    } catch (error) {
      try {
        if (
          (await getNumberRelease(release.workspace, release.number_id))
            ?.state === "completed"
        ) {
          completed++;
          continue;
        }
      } catch (readError) {
        logger.error("number_release.recovery_completion_check_failed", {
          releaseId: release.id,
          error: readError,
        });
      }
      logger.error("number_release.recovery_failed", {
        workspaceId: release.workspace,
        releaseId: release.id,
        error,
      });
      await retainNumberReleaseForRecovery(release);
    }
  }
  return {
    examined: releases.length,
    completed,
    pending: releases.length - completed,
  };
}
