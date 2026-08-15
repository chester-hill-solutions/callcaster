import { z } from "zod";
import {
  runCallStatusSideEffects,
  runRecordingSideEffects,
  runSmsStatusSideEffects,
} from "@/lib/worker/webhook-side-effects.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
import { legacyObjectParam, legacyStringParam } from "@/lib/worker/job-registry.server";

export type SidAndTwilioParams = {
  sid: string;
  twilioParams: Record<string, string>;
};

/**
 * Shared params schema for the three Twilio webhook fast-ack side-effect job
 * types (#1239 A2): each one used to re-implement the same
 * `requireSidAndTwilioParams` narrowing (sid key differs, everything else is
 * identical). One factory, parameterized on the sid field name and the label
 * used in the error message, replaces all three copies.
 *
 * Both `callSid` and `messageSid` are read from `job.params` regardless of
 * which one this job type actually uses — matching the old code, which read
 * `job.params[sidKey]` and simply never looked at the other key.
 */
export function sidAndTwilioParamsSchema(
  sidKey: "callSid" | "messageSid",
  label: string,
): z.ZodType<SidAndTwilioParams> {
  return z
    .object({
      callSid: legacyStringParam(),
      messageSid: legacyStringParam(),
      twilioParams: legacyObjectParam<Record<string, string> | undefined>(undefined),
    })
    .transform((value, ctx) => {
      const sid = sidKey === "callSid" ? value.callSid : value.messageSid;
      const twilioParams = value.twilioParams;
      if (!sid || !twilioParams) {
        ctx.addIssue({
          code: "custom",
          message: `${label}: missing ${sidKey} or twilioParams`,
        });
        return z.NEVER;
      }
      return { sid, twilioParams };
    });
}

export async function callStatusSideEffectsHandler(
  job: ClaimedJobRow,
  params: SidAndTwilioParams,
): Promise<unknown> {
  return runCallStatusSideEffects({
    callSid: params.sid,
    twilioParams: params.twilioParams,
  });
}

export async function smsStatusSideEffectsHandler(
  job: ClaimedJobRow,
  params: SidAndTwilioParams,
): Promise<unknown> {
  return runSmsStatusSideEffects({
    messageSid: params.sid,
    twilioParams: params.twilioParams,
  });
}

export async function recordingSideEffectsHandler(
  job: ClaimedJobRow,
  params: SidAndTwilioParams,
): Promise<unknown> {
  return runRecordingSideEffects({
    callSid: params.sid,
    twilioParams: params.twilioParams,
  });
}
