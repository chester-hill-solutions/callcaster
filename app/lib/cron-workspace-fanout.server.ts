import { logger } from "@/lib/logger.server";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { listAllWorkspacesOrdered } from "@/lib/workspace-members-db.server";

/**
 * BILL-01 interim coordinator for cron money jobs.
 *
 * pg_cron posts `workspaceId: null` to the `/api/jobs/*` routes; a null/absent
 * workspaceId means "fan out across all eligible workspaces". This reuses the
 * same all-workspace enumeration as `runLowCreditNotify`
 * ([app/lib/low-credit-notify.server.ts](./low-credit-notify.server.ts)) —
 * `listAllWorkspacesOrdered()` — rather than inventing a second
 * workspace-discovery path. The eventual architecture is durable child jobs
 * via `@chester-hill-solutions/jobqueue` (not yet publishable); see
 * docs/remediation/critical-review-orchestration-plan-2026-07-12.md (BILL-01).
 */

export type CronFanoutFailure = { workspaceId: string; error: string };

export type CronFanoutSummary = {
  ok: true;
  /** Workspaces whose per-workspace operation completed. */
  processed: number;
  /** Workspaces skipped as ineligible (e.g. no Twilio credentials). */
  skipped: number;
  /** Workspaces whose operation threw; never aborts the sweep. */
  failed: number;
  failures: CronFanoutFailure[];
};

/**
 * Run `run(workspaceId)` for every workspace, sequentially (matching the
 * `runLowCreditNotify` coordinator pattern), isolating errors per workspace.
 *
 * - `requireTwilioCredentials`: workspaces whose `twilio_data` has no usable
 *   subaccount credentials are counted as `skipped` (logged, not failed).
 * - A throwing workspace is recorded in `failures` and the sweep continues.
 * - Throws only if the sweep itself cannot run (workspace enumeration fails);
 *   callers translate that into a 500.
 */
export async function runCronWorkspaceFanout(args: {
  /** Job name used as the log-event prefix, e.g. "billing_reconcile". */
  job: string;
  /** Skip (not fail) workspaces without Twilio subaccount credentials. */
  requireTwilioCredentials?: boolean;
  run: (workspaceId: string) => Promise<unknown>;
}): Promise<CronFanoutSummary> {
  const workspaces = await listAllWorkspacesOrdered();

  let processed = 0;
  let skipped = 0;
  const failures: CronFanoutFailure[] = [];

  for (const workspace of workspaces) {
    const workspaceId = workspace.id;
    try {
      if (args.requireTwilioCredentials) {
        const twilioData = await loadWorkspaceTwilioData(workspaceId);
        const creds = readTwilioWorkspaceCredentials(twilioData);
        if (!creds) {
          skipped++;
          logger.info(`${args.job}.fanout_skipped_no_twilio_credentials`, {
            workspaceId,
          });
          continue;
        }
      }

      await args.run(workspaceId);
      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ workspaceId, error: message });
      logger.error(`${args.job}.fanout_workspace_failed`, {
        workspaceId,
        error: message,
      });
    }
  }

  return {
    ok: true,
    processed,
    skipped,
    failed: failures.length,
    failures,
  };
}
