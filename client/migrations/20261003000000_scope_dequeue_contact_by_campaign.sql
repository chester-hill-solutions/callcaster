-- #2096: a call in one campaign must leave every other campaign queue intact.
-- Require the campaign for both primary and household updates. Keep the
-- assigned-agent guard and primary row count from #1260 / #1278.
-- Remove old overloads so no caller can silently use workspace-wide scope.
-- Workspace-wide opt-out stays an explicit application operation.
DROP FUNCTION IF EXISTS public.dequeue_contact(integer, boolean, uuid, text);
DROP FUNCTION IF EXISTS public.dequeue_contact(bigint, boolean, uuid, text);
DROP FUNCTION IF EXISTS public.dequeue_contact(bigint, boolean, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.dequeue_contact(
  passed_contact_id bigint,
  p_campaign_id bigint,
  group_on_household boolean,
  p_workspace uuid,
  dequeued_by_id uuid DEFAULT NULL::uuid,
  dequeued_reason_text text DEFAULT NULL::text
)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  primary_rows integer;
begin
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
