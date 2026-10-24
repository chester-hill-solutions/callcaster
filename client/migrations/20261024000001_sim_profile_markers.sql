ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS sim_marker text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS sim_marker text;
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS sim_marker text;
ALTER TABLE workspace_member ADD COLUMN IF NOT EXISTS sim_marker text;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_sim_name_marker_idx
  ON workspace (name, sim_marker)
  WHERE sim_marker IS NOT NULL;
