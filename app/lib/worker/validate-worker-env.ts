import { validateRequiredEnv } from "@/lib/required-env-keys";

/**
 * Worker process boot validation.
 *
 * This used to check only `DATABASE_URL`, on the theory that handlers needing
 * Twilio/Stripe/Resend would "validate at claim time". They do — by throwing
 * from `env.X()` mid-job. So a worker missing, say, `TWILIO_SID` booted green,
 * claimed jobs happily, failed every Twilio-touching one, burned its three
 * attempts in ~3 minutes and dead-lettered them. Both billing debit paths run
 * through this process, so that is lost revenue announced by nothing louder
 * than a log line.
 *
 * Failing at boot instead is strictly better now that boot failure raises an
 * ops alert (`worker.boot_failed`): loud, immediate and fixable, rather than
 * silent and discovered later from the dead-letter table.
 *
 * The set is deliberately identical to the web app's. Everything in it is
 * genuinely reachable from a handler:
 * - Twilio — compliance provisioning, webhook audit, open sync
 * - Stripe / Resend — billing reconciliation, low-credit and ops notifications
 * - object storage — `audience_upload` writes its result via `uploadObject`
 * - `BASE_URL` — callback URLs baked into provisioned Twilio resources
 */
export function validateWorkerEnv(env: NodeJS.ProcessEnv = process.env): void {
  validateRequiredEnv(env);
}
