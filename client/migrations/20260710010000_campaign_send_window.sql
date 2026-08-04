-- Phase F: per-campaign SMS send window (deliverability / CASL send-time control).
-- Stores a weekly Schedule-shaped object ({ day: { active, intervals:[{start,end}] } })
-- describing when this campaign is allowed to dispatch SMS. NULL means unrestricted
-- (send anytime). This is campaign-only; 1:1 chat sends are never gated by it.
ALTER TABLE public.campaign
  ADD COLUMN IF NOT EXISTS sms_send_window jsonb;
