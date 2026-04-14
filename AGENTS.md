## Learned User Preferences

- When the user says `do the needful`, continue with the most obvious next implementation, cleanup, or verification steps without waiting for repeated confirmation unless blocked.
- For broad bug, typecheck, test, or coverage sweeps, keep iterating until the issue list is exhausted or a real blocker is reached.
- When implementing from an attached plan whose todos already exist, update the existing todos instead of recreating them and work through the full list before stopping.
- Do not modify, overwrite, or reset the user's existing `.env` or environment variables during setup work.

## Design System

- Prefer [app/components/ui/](app/components/ui/) primitives; use `FormField` for form layout, `Section`/`AuthCard` for page structure, `DataTable`/`TablePagination` for tables, and `toast()` from sonner (single root Toaster). See [docs/design-system.md](docs/design-system.md).

## Learned Workspace Facts

- `archive/deprecated/twilio-serverless/**` contains deprecated Twilio Serverless code and can generally be ignored for current runtime and coverage work.
- Local Twilio/calling development uses Localtunnel-style public URLs, and `BASE_URL` should match the current public tunnel URL.
- Queue progress/completion should treat rows with `status = "dequeued"` or a non-null `dequeued_at` as completed work, including duplication dequeues.
- Workspace audio uploads are normalized to canonical MP3 on upload via `ffmpeg`, and production Docker builds install `ffmpeg` for that path.
- Supabase Edge Functions called by **Twilio** (`sms-status`, `ivr-status`, `ivr-recording`, `ivr-flow`) must use `verify_jwt = false` in [`supabase/config.toml`](supabase/config.toml); Twilio sends `X-Twilio-Signature`, not a Supabase JWT.
- **`number-rental-billing`** is invoked by pg_cron via `net.http_post` without an `Authorization` header ([`supabase/migrations/202604140001_number_rental_billing_cron.sql`](supabase/migrations/202604140001_number_rental_billing_cron.sql)); it needs `verify_jwt = false`. **`twilio-open-sync`** cron sends `Authorization: Bearer` from `app.settings.supabase_service_role_jwt` ([`supabase/migrations/20260414200000_twilio_open_sync_cron.sql`](supabase/migrations/20260414200000_twilio_open_sync_cron.sql)); default JWT verification can stay on.
- If any Edge Function is wired only from the **Supabase Dashboard** (Database Webhooks, schedules), confirm whether the caller sends a JWT before changing `verify_jwt`; in-repo SQL only registers the two cron jobs above.
