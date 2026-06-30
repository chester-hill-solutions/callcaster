import { env } from "@/lib/env.server";

export type TwilioIvrRuntime = "remix" | "edge";

/**
 * Which Twilio-facing IVR runtime to use for newly initiated calls.
 * Default `remix` until live audit confirms Edge-only traffic.
 * Set `TWILIO_IVR_RUNTIME=edge` to route new IVR calls through Postgres Edge.
 */
export function getTwilioIvrRuntime(): TwilioIvrRuntime {
  const value = process.env.TWILIO_IVR_RUNTIME?.trim().toLowerCase();
  if (value === "edge") return "edge";
  return "remix";
}

export function resolveIvrCallUrls(campaignId: number | string): {
  flowUrl: string;
  statusCallback: string;
  runtime: TwilioIvrRuntime;
} {
  const runtime = getTwilioIvrRuntime();
  if (runtime === "edge") {
    const base = env.BASE_URL().replace(/\/$/, "");
    return {
      flowUrl: `${base}/functions/v1/ivr-flow`,
      statusCallback: `${base}/functions/v1/ivr-status`,
      runtime,
    };
  }

  const base = env.BASE_URL().replace(/\/$/, "");
  return {
    flowUrl: `${base}/api/ivr/${campaignId}/page_1/`,
    statusCallback: `${base}/api/ivr/status`,
    runtime,
  };
}
