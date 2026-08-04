import { secureCompare } from "@/lib/secure-compare";
import { data as routeData } from "react-router";
import {
  enqueueJob,
  type EnqueueJobResult,
} from "@/lib/worker/enqueue-job.server";
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
 */
export function createCronEnqueueAction(args: {
  type: string;
  buildParams: (
    body: Record<string, unknown>,
    workspaceId?: string,
  ) => Record<string, unknown>;
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
      const result = await enqueueJob({
        type: args.type,
        workspaceId,
        params: args.buildParams(body, workspaceId),
        dedupe: { kind: "live", workspaceId },
      });
      return toEnqueueResponse(result);
    },
  };
}
