-- Live-call disposition ("Save and Next") 500'd on every call. db-rpc.server.ts
-- calls dequeue_contact with the contact id cast `::bigint`, but the function
-- declared `passed_contact_id integer`, so no overload matched:
--   `function dequeue_contact(bigint, boolean, uuid, unknown) does not exist`
-- and the whole call screen crashed ("c.forEach is not a function").
--
-- The body is already correct (queue_state, not the dropped status column) — only
-- the parameter type is wrong. contact ids are bigint (contact.id,
-- campaign_queue.contact_id), so bigint is the right type. Changing an IN-param
-- type adds an overload rather than replacing, so drop the integer version first.
-- Any internal caller passing an integer still resolves here (integer widens to
-- bigint implicitly), so this is safe for all callers. Body is verbatim the
-- current definition — only the first parameter's type changed.

DROP FUNCTION IF EXISTS public.dequeue_contact(integer, boolean, uuid, text);

CREATE OR REPLACE FUNCTION public.dequeue_contact(passed_contact_id bigint, group_on_household boolean, dequeued_by_id uuid DEFAULT NULL::uuid, dequeued_reason_text text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
    and (queue_state is null or queue_state = 'queued');

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
      and cq.contact_id = c2.id
      and (cq.queue_state is null or cq.queue_state = 'queued');
  end if;
end;
$function$;
