-- Funded queue completion uses its saved actor, not a later claimant.
-- Preserve live or newer work and unknown historical household ownership.
CREATE OR REPLACE FUNCTION public.dequeue_contact(
  passed_contact_id bigint,
  p_campaign_id bigint,
  group_on_household boolean,
  p_workspace uuid,
  dequeued_by_id uuid DEFAULT NULL::uuid,
  dequeued_reason_text text DEFAULT NULL::text,
  p_voice_reservation_id uuid DEFAULT NULL::uuid
)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  primary_rows integer;
  funded public.workspace_voice_reservation%rowtype;
  locked_queue_ids bigint[];
  eligible_queue_ids bigint[];
begin
  if p_voice_reservation_id is not null then
    -- Match admission's workspace-first lock order. Concurrent new funded
    -- intents cannot enter a household while its terminal update runs.
    perform 1 from public.workspace where id = p_workspace for no key update;
    select * into funded from public.workspace_voice_reservation
    where id = p_voice_reservation_id and workspace = p_workspace
      and campaign_id = p_campaign_id and contact_id = passed_contact_id;
    if not found or funded.queue_id is null or funded.queue_generation is null then return 0; end if;

    -- Lock the full candidate set in a stable order. A later insert is not
    -- in this set; a concurrent re-add is checked again after its row lock.
    select array_agg(candidate.id) into locked_queue_ids from (
      select cq.id from public.campaign_queue cq
      join public.contact c on c.id = cq.contact_id and c.workspace = p_workspace
      where cq.workspace = p_workspace and cq.campaign_id = p_campaign_id
        and (c.id = passed_contact_id or (group_on_household and c.household_id = (
          select household_id from public.contact where id = passed_contact_id and workspace = p_workspace
        )))
      order by cq.id for no key update of cq
    ) candidate;
    -- The reservation owns this result. Today's assignee cannot lend it authority.
    select u.id into dequeued_by_id from public."user" u where u.id::text = funded.user_id;

    select array_agg(cq.id) into eligible_queue_ids from public.campaign_queue cq
    where cq.id = any(locked_queue_ids) and cq.workspace = p_workspace
      and cq.campaign_id = p_campaign_id
      and (cq.assigned_to_user_id is null or cq.assigned_to_user_id::text = funded.user_id)
      and (cq.id = funded.queue_id or (
        -- Old transaction-start timestamps do not prove a sibling's insertion.
        (cq.inserted_at is not null or cq.redial_requested_at is not null)
        and cq.created_at <= funded.created_at
        and coalesce(cq.redial_requested_at, cq.inserted_at, cq.created_at) <= funded.created_at
        and (cq.voice_reservation_id is null or exists (
          select 1 from public.workspace_voice_reservation sibling
          where sibling.id = cq.voice_reservation_id and sibling.workspace = p_workspace
            and sibling.created_at <= funded.created_at and sibling.state in ('settled', 'released')
        ))
      ))
      and not exists (
        select 1 from public.outreach_attempt newer
        where newer.workspace = p_workspace and newer.campaign_id = p_campaign_id
          and newer.contact_id = cq.contact_id and newer.created_at > funded.created_at
          and newer.id is distinct from funded.outreach_attempt_id
      )
      and not exists (
        select 1 from public.call customer
        where customer.workspace = p_workspace and customer.campaign_id = p_campaign_id
          and customer.contact_id = cq.contact_id
          and coalesce(customer.status::text, '') not in ('completed', 'failed', 'no-answer', 'busy', 'canceled')
          and (customer.sid is distinct from funded.provider_sid or customer.account_sid is distinct from funded.account_sid)
          and not exists (
            select 1 from public.workspace_voice_reservation setup
            where setup.workspace = p_workspace and setup.setup_sid = customer.sid and setup.account_sid = customer.account_sid
          )
          and not exists (
            select 1 from public.workspace_voice_audio_connection audio
            where audio.workspace = p_workspace and audio.provider_sid = customer.sid and audio.account_sid = customer.account_sid
          )
      );
  end if;
  update public.campaign_queue
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  where contact_id = passed_contact_id
    and workspace = p_workspace
    and campaign_id = p_campaign_id
    and (p_voice_reservation_id is null or (
      id = funded.queue_id and id = any(eligible_queue_ids)
      and dispatch_generation = funded.queue_generation
      and voice_reservation_id = funded.id and dequeued_at is null
    ))
    and (
      queue_state is null
      or queue_state = 'queued'
      or (
        queue_state = 'assigned'
        and dequeued_by_id is not null
        and assigned_to_user_id = dequeued_by_id
      )
    );

  get diagnostics primary_rows = row_count;

  if p_voice_reservation_id is not null and primary_rows = 0 then return 0; end if;

  if group_on_household then
    update public.campaign_queue cq
    set
      queue_state = 'dequeued',
      assigned_to_user_id = null,
      provider_status = null,
      dequeued_by = dequeued_by_id,
      dequeued_at = now(),
      dequeued_reason = dequeued_reason_text
    from public.contact c1
    join public.contact c2 on c1.household_id is not null and c1.household_id = c2.household_id
    where
      c1.id = passed_contact_id
      and c1.workspace = p_workspace
      and c2.workspace = p_workspace
      and cq.contact_id = c2.id
      and cq.workspace = p_workspace
      and cq.campaign_id = p_campaign_id
      and (p_voice_reservation_id is null or (
        cq.id = any(eligible_queue_ids) and cq.dequeued_at is null
      ))
      -- A wrong campaign must not dequeue siblings of an absent primary row.
      and exists (
        select 1 from public.campaign_queue source_queue
        where source_queue.contact_id = passed_contact_id
          and source_queue.workspace = p_workspace
          and source_queue.campaign_id = p_campaign_id
      )
      and (
        cq.queue_state is null
        or cq.queue_state = 'queued'
        or (
          cq.queue_state = 'assigned'
          and dequeued_by_id is not null
          and cq.assigned_to_user_id = dequeued_by_id
        )
      );
  end if;

  return primary_rows;
end;
$function$;
