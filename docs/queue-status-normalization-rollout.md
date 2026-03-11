## Queue Status Normalization Rollout

This repository now reads queue rows through compatibility helpers in `app/lib/queue-status.ts`, but the schema and RPC changes still need to land wherever `campaign_queue` and its queue RPCs are managed.

### Target Columns

- Add `queue_state text null` with staged values `queued | assigned | dequeued | canceled`.
- Add `assigned_to_user_id uuid null` for manual-dial ownership.
- Add `provider_status text null` for Twilio or provider lifecycle updates.
- Keep `status` during rollout as the legacy compatibility field.

### Backfill

Run a one-time backfill before app readers switch fully to normalized fields:

```sql
update campaign_queue
set
  queue_state = case
    when dequeued_at is not null or status = 'dequeued' then 'dequeued'
    when status = 'queued' then 'queued'
    when status ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'assigned'
    else 'assigned'
  end,
  assigned_to_user_id = case
    when status ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then status::uuid
    else null
  end,
  provider_status = case
    when status in ('queued', 'dequeued') then null
    when status ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then null
    else status
  end
where queue_state is null
   or assigned_to_user_id is null
   or provider_status is null;
```

### RPC Changes

Update queue RPCs to dual-write normalized fields while keeping `status` in sync until legacy cleanup:

- `handle_campaign_queue_entry`
  - Requeue should set `status = 'queued'`, `queue_state = 'queued'`, clear `assigned_to_user_id`, clear `provider_status`, and clear dequeue metadata.
- `dequeue_contact`
  - Dequeue should set `status = 'dequeued'`, `queue_state = 'dequeued'`, clear `assigned_to_user_id`, clear `provider_status`, and persist dequeue metadata.
- `select_and_update_campaign_contacts`
  - Assignment should set `queue_state = 'assigned'`, set `assigned_to_user_id`, clear `provider_status`, and keep legacy `status = assigned_to_user_id::text` during rollout.
- `get_campaign_queue`
  - Include the new columns in the result shape.
- Any Twilio/provider callback writer
  - Keep queue ownership in `assigned_to_user_id`.
  - Write provider lifecycle to `provider_status`.
  - Only use `status` as a mirrored compatibility field until cleanup.

### Suggested Indexes

```sql
create index if not exists campaign_queue_campaign_state_idx
  on campaign_queue (campaign_id, queue_state);

create index if not exists campaign_queue_campaign_assigned_user_idx
  on campaign_queue (campaign_id, assigned_to_user_id)
  where assigned_to_user_id is not null;

create index if not exists campaign_queue_campaign_provider_status_idx
  on campaign_queue (campaign_id, provider_status)
  where provider_status is not null;
```

### Cutover Order

1. Ship the external schema and RPC dual-write changes.
2. Regenerate `app/lib/database.types.ts` from the updated schema source.
3. Enable normalized writes in app/function queue writers.
4. Remove legacy `status` fallback from `app/lib/queue-status.ts` after all readers and writers are migrated.
