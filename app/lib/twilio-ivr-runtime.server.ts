import { env } from "@/lib/env.server";

export type TwilioIvrRuntime = "remix";

/**
 * Twilio-facing IVR runtime is permanently "remix".
 * The legacy "edge" runtime (Supabase Edge Functions) was removed.
 */
export function getTwilioIvrRuntime(): TwilioIvrRuntime {
  return "remix";
}

export function resolveIvrCallUrls(campaignId: number | string): {
  flowUrl: string;
  statusCallback: string;
  runtime: TwilioIvrRuntime;
} {
  const base = env.BASE_URL().replace(/\/$/, "");
  return {
    flowUrl: `${base}/api/ivr/${campaignId}/page_1/`,
    statusCallback: `${base}/api/ivr/status`,
    runtime: "remix",
  };
}
