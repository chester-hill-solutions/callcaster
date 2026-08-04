-- Make the "rental unpaid" warning idempotent, the way suspension already is.
--
-- The ladder's suspend rung is naturally idempotent: it early-returns when
-- `suspended_at` is already set, so a number is suspended and emailed once.
-- The warn rung had no such state. It fires whenever the unpaid count is
-- exactly 1, and the sweep runs daily — so a workspace sitting at one unpaid
-- cycle emailed its owners and admins "Payment needed for +1555…" every day,
-- for up to a month, until the second cycle elapsed and it escalated.
--
-- It also interacts badly with clearing `suspended_at` on payment: a suspended
-- customer who partially pays drops back to one unpaid cycle and starts
-- receiving daily WARN mail while still suspended.
--
-- Storing the cycle count we last warned at, rather than a timestamp or a
-- boolean, is what makes re-escalation work: if the customer falls further
-- behind and comes back to one unpaid cycle later (paid some, missed more),
-- the count differs from the stored value and a fresh warning is correct.
-- A boolean would suppress that second, legitimate warning forever.
--
-- Nullable with no default, so every existing number reads as "never warned"
-- and gets exactly one warning on the next sweep.

ALTER TABLE workspace_number
  ADD COLUMN IF NOT EXISTS rental_warned_cycle integer;
