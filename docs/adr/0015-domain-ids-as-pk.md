# Domain IDs as PK, Twilio SIDs as correlation columns

`call` and `message` tables get a domain `id` (auto-increment/UUID) as primary key; `twilio_sid` becomes a nullable indexed column for webhook correlation and idempotency keys. Drop Twilio API noise columns: `account_sid`, `api_version`, `subresource_uris`, `uri`, `trunk_sid`, `group_sid`, `price`, `price_unit`. `parent_call_sid` → `parent_call_id` (FK to own `call.id`). `inbound_queue_entry.call_sid` → `call_id` FK. Keep domain-relevant fields: `twilio_sid`, `from`, `to`, `direction`, `status`, `duration`, `error_code`, `error_message`, `recording_url`, `recording_sid`, `conference_id`, `campaign_id`, `contact_id`, `workspace_id`, `outreach_attempt_id`. Idempotency keys (`call:<CallSid>`, `sms:<MessageSid>`) continue to use Twilio SIDs — that's the deduplication dimension (Twilio retries deliver the same SID).

## Recording playback and correlation

`recording_url` remains correlation and repair metadata. It is not a playback
fallback. Call-log playback uses a signed URL for the stored audio copy. If a
provider recording URL exists but stored playback is unavailable, the call log
shows "Recording unavailable". A call with no recording keeps the Voicemails link.

Inbound voicemail copies use
`voicemail/<workspace>/voicemail-<CallSid>-<RecordingSid>.mp3` in the workspace audio
bucket. A preparation retry for the same recording overwrites that object; another
RecordingSid has a separate key. A completed delivery replay reuses its saved
result without another upload or email.

The adopted [DATA-02 retention policy](../remediation/critical-review-orchestration-plan-2026-07-12.md#data-02--sensitive-data-retention-is-not-enforced-end-to-end)
sets a 90-day default for recording media and two years for call metadata,
including `recording_url` and `recording_sid`. Workspace owners can choose shorter
periods, and a legal hold can pause deletion for identified records. Keeping the
correlation field does not extend media retention. This source clarification does
not establish that deletion jobs or legal-hold enforcement are deployed.

## References

- `app/lib/database.types.ts` (call/message tables with `sid` as PK + Twilio API noise columns)
- `app/lib/campaign-billing.server.ts:58` (idempotency keys using SIDs), `supabase/migrations/202606100001_*.sql` (idempotency key patterns)
