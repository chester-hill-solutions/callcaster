import { z } from "zod";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { createErrorResponse } from "@/lib/errors.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneSessionAuth } from "@/lib/capability-guard.server";
import { defineAction } from "@/lib/handler.server";
import { logger } from "@/lib/logger.server";

/**
 * Sink for client flash telemetry (#1293).
 *
 * The client beacons transient error-UI appearances (error/warning toasts,
 * `role="alert"` banners) with a call-site stack and recent client
 * breadcrumbs. This handler's only job is to put them in the server log, so
 * "an error flashed and disappeared" is answerable from the deployment's
 * logs instead of costing a debugging session per report.
 *
 * Sizes are capped in the schema: the client already truncates, but the
 * schema is the contract — a hostile or buggy client cannot use this to
 * write unbounded blobs into the log stream.
 */

const breadcrumbSchema = z.object({
  t: z.number().finite(),
  kind: z.string().max(60),
  detail: z.string().max(220),
});

const flashEventSchema = z.object({
  kind: z.enum(["toast-error", "toast-warning", "alert-banner"]),
  message: z.string().max(520),
  stack: z.string().max(4100).optional(),
  breadcrumbs: z.array(breadcrumbSchema).max(50),
  url: z.string().max(320),
  ts: z.string().max(40),
});

const clientFlashBodySchema = z.object({
  events: z.array(flashEventSchema).min(1).max(10),
});

export const action = defineAction({
  auth: dataPlaneSessionAuth(),
  sideEffects: ["none"],
  handler: async ({ request, auth }) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    const parsed = await parseJsonBodyOrResponse(request, clientFlashBodySchema);
    if (parsed instanceof Response) return parsed;

    try {
      for (const event of parsed.events) {
        // warn level: these are user-visible error surfaces by definition.
        logger.warn("Client flash captured", {
          workspaceId: auth.workspaceId,
          userId: auth.userId,
          kind: event.kind,
          message: event.message,
          url: event.url,
          clientTs: event.ts,
          stack: event.stack,
          breadcrumbs: event.breadcrumbs,
        });
      }
      return jsonResponse({ ok: true }, 200);
    } catch (error) {
      return createErrorResponse(error, "Failed to record client flash");
    }
  },
});
