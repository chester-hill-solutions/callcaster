# Domain IDs as PK, Twilio SIDs as correlation columns

`call` and `message` tables get a domain `id` (auto-increment/UUID) as primary key; `twilio_sid` becomes a nullable indexed column for webhook correlation and idempotency keys. Drop Twilio API noise columns: `account_sid`, `api_version`, `subresource_uris`, `uri`, `trunk_sid`, `group_sid`, `price`, `price_unit`. `parent_call_sid` → `parent_call_id` (FK to own `call.id`). `inbound_queue_entry.call_sid` → `call_id` FK. Keep domain-relevant fields: `twilio_sid`, `from`, `to`, `direction`, `status`, `duration`, `error_code`, `error_message`, `recording_url`, `recording_sid`, `conference_id`, `campaign_id`, `contact_id`, `workspace_id`, `outreach_attempt_id`. Idempotency keys (`call:<CallSid>`, `sms:<MessageSid>`) continue to use Twilio SIDs — that's the deduplication dimension (Twilio retries deliver the same SID).

## References

- `app/lib/database.types.ts` (call/message tables with `sid` as PK + Twilio API noise columns)
- `app/lib/campaign-billing.server.ts:58` (idempotency keys using SIDs), `supabase/migrations/202606100001_*.sql` (idempotency key patterns)
