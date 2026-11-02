-- Select the one customer topology without scanning the workspace's audio history.
create index if not exists voice_audio_manual_topology
  on public.workspace_voice_audio_connection(workspace, reservation_id, promotion_result)
  where target_kind = 'direct';
