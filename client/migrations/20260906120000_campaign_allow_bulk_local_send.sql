-- campaign.allow_bulk_local_send: an admin's explicit, per-campaign override
-- of the "large bulk send on a Canadian local number" launch block (#1482).
-- Off by default; the launch prompt sets it after a confirmed acknowledgement
-- and can clear it again. Re-runnable: IF NOT EXISTS.
ALTER TABLE public.campaign
  ADD COLUMN IF NOT EXISTS allow_bulk_local_send boolean NOT NULL DEFAULT false;
