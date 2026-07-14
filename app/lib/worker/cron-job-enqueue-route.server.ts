import { data as routeData } from "react-router";
import { defineAction } from "@/lib/handler.server";
import {
  enqueueJob,
  type EnqueueJobResult,
} from "@/lib/worker/enqueue-job.server";

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
  return Boolean(cronSecret && headerSecret === cronSecret);
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
export function defineCronEnqueueAction(args: {
  type: string;
  buildParams: (
    body: Record<string, unknown>,
    workspaceId?: string,
  ) => Record<string, unknown>;
}) {
  return defineAction({
    sideEffects: ["db-write"],
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
  });
}
