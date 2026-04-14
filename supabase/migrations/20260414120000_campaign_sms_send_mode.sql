-- Per-campaign SMS delivery: Messaging Service vs from-number.
-- Nullable columns preserve legacy behavior when unset.

alter table public.campaign
  add column if not exists sms_send_mode text null
    constraint campaign_sms_send_mode_check
      check (sms_send_mode is null or sms_send_mode in ('messaging_service', 'from_number')),
  add column if not exists sms_messaging_service_sid text null;

comment on column public.campaign.sms_send_mode is 'SMS campaigns: messaging_service vs from_number; null = legacy / follow workspace portal defaults.';
comment on column public.campaign.sms_messaging_service_sid is 'Twilio Messaging Service SID when sms_send_mode is messaging_service.';
