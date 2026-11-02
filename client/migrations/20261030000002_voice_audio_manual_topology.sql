-- A failed audio leg must not create a second customer promotion or room.
alter table public.workspace_voice_audio_connection
  add column if not exists promotion_result text
    check (promotion_result in ('ready', 'rejected', 'closed'));

do $$
begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.workspace_voice_audio_connection'::regclass
      and conname = 'voice_audio_promotion_result_owner') then
    alter table public.workspace_voice_audio_connection
      add constraint voice_audio_promotion_result_owner check (
        promotion_result is null or (target_kind = 'direct' and promotion_requested_at is not null)
      );
  end if;
end $$;

create unique index if not exists voice_audio_unresolved_promotion
  on public.workspace_voice_audio_connection(workspace, reservation_id)
  where target_kind = 'direct' and promotion_requested_at is not null and promotion_result is null;
create unique index if not exists voice_audio_canonical_manual_room
  on public.workspace_voice_audio_connection(workspace, reservation_id)
  where target_kind = 'direct' and promotion_result = 'ready';
create index if not exists voice_audio_unresolved_promotion_actor
  on public.workspace_voice_audio_connection(workspace, user_id)
  where target_kind = 'direct' and promotion_requested_at is not null and promotion_result is null;
