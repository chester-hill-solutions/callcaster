# Per-workspace throughput config derived from Twilio sender class

SMS messages-per-second, voice calls-per-second, concurrent call limits, and parallel dispatch are per-workspace (stored in `workspace_twilio_config`), with sender-class-aware defaults: short code = 100 MPS, verified toll-free = 3 MPS, local = 1 MPS, US A2P 10DLC = 1 MPS. Different Twilio number types have different carrier rate limits; a global config would break carrier compliance.

## References

- `supabase/functions/_shared/throughput-config.ts` (`TwilioSmsSenderClass`, `WorkspaceThroughputPortalConfig`, `defaultSmsTargetMps`), `supabase/functions/_shared/queue-policy.ts` (`DISPATCH_TICK_MS`, `MAX_QUEUE_ATTEMPTS`, `STALE_CLAIM_TIMEOUT_MS`)
