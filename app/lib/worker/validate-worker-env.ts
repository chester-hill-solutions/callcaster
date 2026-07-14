/**
 * Worker process boot validation — lighter than the full web app gate.
 * Handlers that need Twilio/Stripe/Resend validate at claim time.
 */
export function validateWorkerEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.DATABASE_URL) {
    throw new Error("Missing required environment variables: DATABASE_URL");
  }
}
