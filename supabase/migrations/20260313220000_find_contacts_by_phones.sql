-- Batch RPC: fetch contacts by workspace and multiple phone numbers in one round-trip.
-- Uses same normalisation as app (digits only; 10 digits => 11 with leading 1) for matching.

create or replace function public.normalise_phone_key(phone text)
returns text
language sql
immutable
as $$
  select case
    when phone is null or trim(phone) = '' then null
    else (
      with d as (
        select regexp_replace(trim(phone), '\D', '', 'g') as digits
      )
      select case
        when length(d.digits) = 10 then '1' || d.digits
        when length(d.digits) = 11 and left(d.digits, 1) = '1' then d.digits
        else d.digits
      end
      from d
    )
  end;
$$;

create or replace function public.find_contacts_by_phones(
  p_workspace_id uuid,
  p_phone_numbers text[]
)
returns setof public.contact
language sql
stable
security definer
set search_path = public
as $$
  with input_phones as (
    select unnest(p_phone_numbers) as raw
  ),
  search_keys as (
    select distinct normalise_phone_key(raw) as key
    from input_phones
    where normalise_phone_key(raw) is not null
  )
  select c.*
  from public.contact c
  join search_keys s on normalise_phone_key(c.phone) = s.key
  where c.workspace = p_workspace_id;
$$;

comment on function public.find_contacts_by_phones(uuid, text[]) is
  'Returns contacts in the workspace whose phone matches any of the given numbers (batch version of find_contact_by_phone).';
