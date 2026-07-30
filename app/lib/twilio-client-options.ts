/**
 * Per-request ceiling for Twilio REST calls.
 *
 * The SDK defaults to waiting indefinitely. The worker is a single-threaded
 * poll loop, so one hung socket stalls every queued job behind it; on the web
 * side it holds a request and one of only ten DB pool slots. `withTwilioRetry`
 * layers retries on top, so this bounds a single attempt.
 *
 * Kept in its own module (rather than in `twilio.server.ts`) so importing it
 * never drags the Twilio SDK — or a mock of it — into a consumer.
 */
export const TWILIO_REQUEST_TIMEOUT_MS = 15_000;
