ALTER TABLE public.workspace_number
  ADD COLUMN IF NOT EXISTS inbound_ring_count integer NOT NULL DEFAULT 4;

ALTER TABLE public.workspace_number
  DROP CONSTRAINT IF EXISTS workspace_number_inbound_ring_count_check;

ALTER TABLE public.workspace_number
  ADD CONSTRAINT workspace_number_inbound_ring_count_check
  CHECK (inbound_ring_count >= 1 AND inbound_ring_count <= 10);
