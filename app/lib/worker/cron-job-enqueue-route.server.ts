import { secureCompare } from "@/lib/secure-compare";
import { data as routeData } from "react-router";
import type { EnqueueJobResult } from "@/lib/worker/enqueue-job.server";
import { enqueueRegisteredJob, type JobParamsMap } from "@/lib/worker/job-params.server";
import type { SideEffect } from "@/lib/handler.server";

function toEnqueueResponse(result: EnqueueJobResult) {
  return routeData({
    ok: true as const,
    enqueued: result.enqueued,
    deduped: result.deduped ?? !result.enqueued,
    jobId: result.jobId,
  });
}

function verifyCronSecret(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  if (!cronSecret || !headerSecret) return false;
  // Constant-time, like every other shared-secret comparison in the codebase
  // (api-auth.server.ts, twilio-webhook.server.ts, media-stream-token.server.ts).
  // This was the only one left using ===.
  return secureCompare(headerSecret, cronSecret);
}

export function parseCronWorkspaceId(
  body: Record<string, unknown>,
): string | undefined {
  return typeof body.workspaceId === "string" ? body.workspaceId : undefined;
}

/**
 * Legacy HTTP cron entry points enqueue coordinator/workspace jobs only.
 * WS-A: Bun worker owns execution after enqueue.
 *
 * `type` is narrowed to a registered job type and `buildParams` must return
 * that type's zod-inferred params shape (#1239 A3) — `body` is still an
 * untrusted `Record<string, unknown>` parsed straight off the request, so
 * `buildParams` is where callers narrow individual fields out of it (see
 * `twilio-open-sync.action.server.ts`'s `typeof body.callLimit === "number"`
 * checks) rather than spreading it wholesale into `params`.
 */
export function createCronEnqueueAction<Type extends keyof JobParamsMap & string>(args: {
  type: Type;
  buildParams: (
    body: Record<string, unknown>,
    workspaceId?: string,
  ) => JobParamsMap[Type];
  /** Downstream effects of the enqueued job (e.g. "credit" for billing jobs). */
  extraSideEffects?: SideEffect[];
}): {
  sideEffects: SideEffect[];
  handler: (ctx: { request: Request }) => Promise<unknown>;
} {
  return {
    sideEffects: ["db-write", ...(args.extraSideEffects ?? [])],
    handler: async ({ request }) => {
      if (!verifyCronSecret(request)) {
        return routeData({ error: "Unauthorized" }, { status: 401 });
      }

      const body = await request.json().catch(
        () => ({} as Record<string, unknown>),
      );
      const workspaceId = parseCronWorkspaceId(body);
      const result = await enqueueRegisteredJob({
        type: args.type,
        workspaceId,
        params: args.buildParams(body, workspaceId),
        dedupe: { kind: "live", workspaceId },
      });
      return toEnqueueResponse(result);
    },
  };
}
