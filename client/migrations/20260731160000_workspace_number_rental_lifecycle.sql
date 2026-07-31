-- Rental non-payment lifecycle state on workspace_number.
--
-- Policy (set by the product owner, 2026-07-31): one unpaid cycle warns, the
-- next suspends, the next releases.
--
-- Only `suspended_at` is stored. Release goes through the existing
-- removeWorkspacePhoneNumber, which releases at Twilio, detaches the number
-- from the workspace Messaging Service, and deletes the row — so a released
-- number has no row to carry a flag. The durable record of a release is the
-- ops alert and the customer email, not a tombstone here.
--
-- Nullable with no default, so every existing number reads as "not suspended"
-- and no existing query changes meaning until it filters on this explicitly.

ALTER TABLE workspace_number
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- The billing sweep scans rented numbers per workspace on every run.
CREATE INDEX IF NOT EXISTS workspace_number_rented_idx
  ON workspace_number (workspace, type);
