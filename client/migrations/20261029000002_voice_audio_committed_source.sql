-- Keep original-source retirement checks selective across conference generations.
create index if not exists voice_audio_committed_source
  on public.workspace_voice_audio_connection(workspace, account_sid, source_agent_sid)
  where committed_at is not null;
